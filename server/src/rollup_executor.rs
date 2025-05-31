use anyhow::Result;
use borsh::{BorshDeserialize, BorshSerialize};
use client_sdk::transaction_builder::{OptimisticCommitments, TxExecutorHandler};
use hyle_modules::{
    bus::{BusClientSender, SharedMessageBus},
    log_error, log_warn, module_bus_client, module_handle_messages,
    modules::Module,
};
use sdk::{
    BlobTransaction, Block, BlockHeight, Calldata, ContractName, Hashed, HyleOutput, Identity,
    LaneId, MempoolStatusEvent, NodeStateEvent, TransactionData, TxContext, TxHash,
};
use std::collections::{BTreeMap, HashSet};
use std::fmt;
use std::{
    any::{Any, TypeId},
    collections::BTreeSet,
};
use std::{
    fmt::Debug,
    ops::{Deref, DerefMut},
    path::PathBuf,
    vec,
};
use tracing::info;

pub struct RollupExecutor {
    bus: RollupExecutorBusClient,
    data_directory: PathBuf,
    store: RollupExecutorStore,
}

impl Deref for RollupExecutor {
    type Target = RollupExecutorStore;
    fn deref(&self) -> &Self::Target {
        &self.store
    }
}
impl DerefMut for RollupExecutor {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.store
    }
}

pub trait RollupContract: TxExecutorHandler + Debug + Send + Sync + OptimisticCommitments {
    fn clone_box(&self) -> Box<dyn RollupContract>;
    fn borsh_serialize_box(&self) -> Result<Vec<u8>, std::io::Error>;
    fn as_any(&self) -> &dyn Any;
}

impl<T> RollupContract for T
where
    T: 'static
        + OptimisticCommitments
        + TxExecutorHandler
        + BorshSerialize
        + BorshDeserialize
        + Clone
        + Debug
        + Send
        + Sync,
{
    fn clone_box(&self) -> Box<dyn RollupContract> {
        Box::new(self.clone())
    }
    fn borsh_serialize_box(&self) -> Result<Vec<u8>, std::io::Error> {
        borsh::to_vec(self)
    }
    fn as_any(&self) -> &dyn Any {
        self
    }
}

// Wrapper for contract trait objects with manual Clone/Debug
pub struct ContractBox {
    type_id: TypeId,
    inner: Box<dyn RollupContract + Send + Sync>,
}

impl ContractBox {
    pub fn new<T>(inner: T) -> Self
    where
        T: TxExecutorHandler
            + OptimisticCommitments
            + Clone
            + Debug
            + BorshSerialize
            + BorshDeserialize
            + Send
            + Sync
            + 'static,
    {
        let type_id = TypeId::of::<T>();
        Self {
            type_id,
            inner: Box::new(inner),
        }
    }

    pub fn downcast<T>(&self) -> Option<&T>
    where
        T: TxExecutorHandler
            + Clone
            + Debug
            + BorshSerialize
            + BorshDeserialize
            + Send
            + Sync
            + 'static,
    {
        self.inner.as_any().downcast_ref::<T>()
    }
}

impl std::ops::Deref for ContractBox {
    type Target = dyn RollupContract;

    fn deref(&self) -> &Self::Target {
        self.inner.deref()
    }
}
impl std::ops::DerefMut for ContractBox {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.inner.deref_mut()
    }
}

impl Clone for ContractBox {
    fn clone(&self) -> Self {
        Self {
            type_id: self.type_id,
            inner: self.inner.clone_box(),
        }
    }
}

impl Debug for ContractBox {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ContractBox {{ {:?} }}", self.inner)
    }
}

impl BorshSerialize for ContractBox {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        // Serialize to a vector of bytes so we can deserialize it as one.
        borsh::to_writer(writer, &self.inner.borsh_serialize_box()?)
    }
}

#[derive(BorshSerialize)]
pub struct RollupExecutorStore {
    validator_lane_id: LaneId,
    block_height: BlockHeight,
    watched_contracts: BTreeSet<ContractName>,

    settled_states: BTreeMap<ContractName, ContractBox>,

    unsettled_sequenced_txs: Vec<(BlobTransaction, TxContext)>,
    unsettled_unsequenced_txs: Vec<(BlobTransaction, TxContext)>,

    optimistic_states: BTreeMap<ContractName, ContractBox>,
}
// À chaque nouveau block:
//   On update block_height

// À chaque nouvelle Tx sequenced:
//   Si la tx existe dans unsettled_unsequenced_txs, on la retire
//   On rajoute la tx dans unsettled_sequenced_txs
//   On recalcule et on compare les states_history pour chaque contract de la premiere tx unsettled_unsequenced_txs

// À chaque nouvelle Tx settled:
//   On execute la transaction et on met à jour settled_contracts
//   On retire la tx dans unsettled_sequenced_tx.
//   (Pour chaque contract surveillé) On vérifie que les states_history qu'on avait pour cette tx sont bien les mêmes que ceux settled
//               !!!! On ne PEUT PAS comparer les states. Il faut comparer des OptimisticCommitments.
//               !!!! Par exemple pour le wallet ca sera le hash d'une session key
//               !!!! Par exemple pour l'orderbook ca sera les balances + les ordres
//        Pour chaque states qui n'est pas le meme; on envoit un event et on recalcule tous les states_history de ce contract pour toutes les tx sequenced puis toutes celles unsequenced

// À chaque nouvelle Tx unsequenced:
//   On execute la transaction et on met à jour optimistic_contracts
//   On envoie un event contenant les program_outputs de l'execution de chaque contrat

#[derive(Default, BorshDeserialize)]
pub struct DeserRollupExecutorStore {
    validator_lane_id: LaneId,
    block_height: BlockHeight,
    watched_contracts: BTreeSet<ContractName>,

    settled_contracts: BTreeMap<ContractName, Vec<u8>>,

    unsettled_sequenced_txs: Vec<(BlobTransaction, TxContext)>,
    unsettled_unsequenced_txs: Vec<(BlobTransaction, TxContext)>,

    optimistic_states: BTreeMap<ContractName, Vec<u8>>,
}

pub struct RollupExecutorCtx {
    pub watched_contracts: BTreeSet<ContractName>,
    pub data_directory: PathBuf,
    pub initial_contracts: BTreeMap<ContractName, ContractBox>,
    pub validator_lane_id: LaneId,
    pub contract_deserializer: fn(Vec<u8>, &ContractName) -> ContractBox,
}

#[derive(Debug, Clone)]
pub enum RollupExecutorEvent {
    /// Event sent when a blob is executed as successfully
    TxExecutionSuccess(
        BlobTransaction,
        Vec<(HyleOutput, ContractName)>,
        // TODO: Remove this field, and make an nested api to get optimistic states
        BTreeMap<ContractName, ContractBox>,
    ),
    /// Event sent when a BlobTransaction fails
    FailedTx(Identity, TxHash, String),
    /// Event sent when a blob is reverted
    /// After a revert, the contract state is recalculated
    /// TODO: Remove the field, and make an nested api to get optimistic states
    Rollback(BTreeMap<ContractName, ContractBox>),
}

module_bus_client! {
#[derive(Debug)]
pub struct RollupExecutorBusClient {
    sender(RollupExecutorEvent),
    receiver(NodeStateEvent),
    receiver(MempoolStatusEvent),
}
}
impl Module for RollupExecutor {
    type Context = RollupExecutorCtx;

    async fn build(bus: SharedMessageBus, ctx: Self::Context) -> Result<Self> {
        let bus = RollupExecutorBusClient::new_from_bus(bus.new_handle()).await;

        let data_directory = ctx.data_directory.clone();
        let file = data_directory.join("rollup_executor.bin");

        let store = match Self::load_from_disk::<DeserRollupExecutorStore>(file.as_path()) {
            Some(store) => RollupExecutorStore::deser_with(store, ctx.contract_deserializer),
            None => RollupExecutorStore {
                block_height: BlockHeight(0),
                validator_lane_id: ctx.validator_lane_id.clone(),
                watched_contracts: ctx.watched_contracts.clone(),
                settled_states: ctx.initial_contracts.clone(),
                unsettled_sequenced_txs: Vec::new(),
                unsettled_unsequenced_txs: Vec::new(),
                optimistic_states: ctx.initial_contracts.clone(),
            },
        };

        Ok(RollupExecutor {
            bus,
            store,
            data_directory,
        })
    }

    async fn run(&mut self) -> Result<()> {
        module_handle_messages! {
            on_bus self.bus,
            listen<NodeStateEvent> event => {
                _ = log_error!(self.handle_node_state_event(event).await, "handle note state event")
            }

            listen<MempoolStatusEvent> event => {
                _ = log_error!(self.handle_mempool_status_event(event).await, "handle mempool status event");
            }
        };

        let _ = log_error!(
            Self::save_on_disk::<RollupExecutorStore>(
                self.data_directory
                    // TODO: Multi-contract: use a canonical file name or one per contract
                    .join("rollup_executor.bin")
                    .as_path(),
                &self.store,
            ),
            "Saving prover"
        );

        Ok(())
    }
}

impl RollupExecutor {
    async fn handle_node_state_event(&mut self, event: NodeStateEvent) -> Result<()> {
        match event {
            NodeStateEvent::NewBlock(block) => {
                self.block_height = block.block_height;
                let mut should_rerun = false;

                // Add all new sequenced transactions to unsettled_sequenced_txs
                should_rerun = should_rerun || self.process_new_sequenced_transactions(&block)?;

                // Handle successful transactions
                // This means execute the transaction on top of settled_contracts and remove it from unsettled_sequenced_txs/unsettled_unsequenced_txs
                should_rerun = should_rerun || self.process_successful_transactions(&block)?;

                // Handle failed/timedout transactions
                // This means remove the transaction from unsettled_sequenced_txs/unsettled_unsequenced_txs
                should_rerun = should_rerun || self.process_failed_transactions(&block)?;
                // and re-execute the transaction from from unsettled_sequenced_txs + unsettled_unsequenced_txs

                // Rerun the transaction from unsettled_sequenced_txs + unsettled_unsequenced_txs
                // starting from settled state; and compare the "optimistic state commitments" on watched contracts
                // This means reexecution at every block. This is inefficient for now.
                if should_rerun {
                    if let Err(e) = self.rerun_watched_contracts_from_settled() {
                        self.bus.send(RollupExecutorEvent::Rollback(
                            self.optimistic_states.clone(),
                        ))?;
                        tracing::warn!("{:?}", e);
                    }
                }

                Ok(())
            }
        }
    }

    async fn handle_mempool_status_event(&mut self, event: MempoolStatusEvent) -> Result<()> {
        match event {
            MempoolStatusEvent::WaitingDissemination { tx, .. } => {
                let tx_ctx = Some(TxContext {
                    lane_id: self.validator_lane_id.clone(),
                    block_height: self.block_height,
                    ..Default::default()
                });
                if let TransactionData::Blob(blob_tx) = tx.transaction_data {
                    if !self.should_keep_transaction(&blob_tx) {
                        return Ok(());
                    }
                    let hyle_outputs = match Self::execute_blob_tx(
                        &mut self.optimistic_states,
                        &blob_tx,
                        tx_ctx,
                    ) {
                        Ok(outputs) => outputs,
                        Err(e) => {
                            // If the execution fails, we send a failed tx event
                            self.bus.send(RollupExecutorEvent::FailedTx(
                                blob_tx.identity.clone(),
                                blob_tx.hashed(),
                                e.to_string(),
                            ))?;
                            return Err(e);
                        }
                    };
                    info!(
                        tx_hash =% blob_tx.hashed(),
                        "🧙 Executed optimistic transaction"
                    );

                    self.bus.send(RollupExecutorEvent::TxExecutionSuccess(
                        blob_tx,
                        hyle_outputs,
                        self.optimistic_states.clone(),
                    ))?;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn process_new_sequenced_transactions(&mut self, block: &Block) -> Result<bool> {
        let mut should_rerun = false;
        for (tx_id, tx) in block.txs.iter() {
            if let TransactionData::Blob(blob_tx) = &tx.transaction_data {
                if !self.should_keep_transaction(blob_tx) {
                    continue;
                }

                let tx_ctx = block.build_tx_ctx(&blob_tx.hashed())?;
                self.unsettled_sequenced_txs.push((blob_tx.clone(), tx_ctx));

                // Remove duplicates from unsequenced
                self.unsettled_unsequenced_txs
                    .retain(|(tx, _)| tx.hashed() != tx_id.1);
                should_rerun = true;
            }
        }
        Ok(should_rerun)
    }

    fn process_successful_transactions(&mut self, block: &Block) -> Result<bool> {
        let mut should_rerun = false;
        for tx_hash in &block.successful_txs {
            // Execute the transaction on settled states
            if let Some((_, tx)) = block.txs.iter().find(|(tx_id, _)| &tx_id.1 == tx_hash) {
                if let TransactionData::Blob(blob_tx) = &tx.transaction_data {
                    if !self.should_keep_transaction(blob_tx) {
                        continue;
                    }
                    self.remove_transaction_from_unsettled(tx_hash.clone());
                    let tx_ctx = block.build_tx_ctx(&blob_tx.hashed())?;
                    should_rerun = true;
                    if let Err(e) =
                        Self::execute_blob_tx(&mut self.settled_states, blob_tx, Some(tx_ctx))
                    {
                        // This _really_ should not happen, as we are executing a successful transaction on settled state.
                        // Probably indicates misconfiguration or desync from the chain.
                        tracing::error!(
                            "Error while executing settled transaction {}: {:?}",
                            tx_hash,
                            e
                        );
                    }
                }
            }
        }
        Ok(should_rerun)
    }

    fn process_failed_transactions(&mut self, block: &Block) -> Result<bool> {
        let mut should_rerun = false;
        let failed_txs: HashSet<_> = block
            .timed_out_txs
            .iter()
            .chain(block.failed_txs.iter())
            .cloned()
            .collect();

        for tx_hash in failed_txs {
            should_rerun = self.remove_transaction_from_unsettled(tx_hash);
        }
        Ok(should_rerun)
    }

    /// Checks if there is a blob related to a handled optimistic contract
    fn should_keep_transaction(&self, blob_tx: &BlobTransaction) -> bool {
        blob_tx
            .blobs
            .iter()
            .any(|blob| self.optimistic_states.contains_key(&blob.contract_name))
    }

    fn remove_transaction_from_unsettled(&mut self, tx_hash: TxHash) -> bool {
        let initial_sequenced_len = self.unsettled_sequenced_txs.len();
        let initial_unsequenced_len = self.unsettled_unsequenced_txs.len();

        self.unsettled_sequenced_txs
            .retain(|(tx, _)| tx.hashed() != tx_hash);
        self.unsettled_unsequenced_txs
            .retain(|(tx, _)| tx.hashed() != tx_hash);

        let sequenced_removed = self.unsettled_sequenced_txs.len() != initial_sequenced_len;
        let unsequenced_removed = self.unsettled_unsequenced_txs.len() != initial_unsequenced_len;

        sequenced_removed || unsequenced_removed
    }

    /// This function executes the blob transaction and returns the outputs of the contract.
    /// Errors on unknown blobs (if we care about the TX at all) or unsuccessful outputs.
    pub fn execute_blob_tx(
        contracts: &mut BTreeMap<ContractName, ContractBox>,
        blob_tx: &BlobTransaction,
        tx_ctx: Option<TxContext>,
    ) -> anyhow::Result<Vec<(HyleOutput, ContractName)>> {
        // 1. Clone all involved contracts' state
        let mut temp_contracts: BTreeMap<ContractName, ContractBox> = BTreeMap::new();
        for blob in &blob_tx.blobs {
            if let Some(contract) = contracts.get(&blob.contract_name) {
                temp_contracts.insert(blob.contract_name.clone(), contract.clone());
            }
        }
        if temp_contracts.is_empty() {
            // we don't care about this TX, ignore.
            return Ok(vec![]);
        }
        let mut hyle_outputs = vec![];
        // 2. Execute all blobs, mutating the correct contract in the map
        for (blob_index, blob) in blob_tx.blobs.iter().enumerate() {
            let Some(contract) = temp_contracts.get_mut(&blob.contract_name) else {
                continue;
            };

            let calldata = Calldata {
                identity: blob_tx.identity.clone(),
                tx_hash: blob_tx.hashed(),
                private_input: vec![],
                blobs: blob_tx.blobs.clone().into(),
                index: blob_index.into(),
                tx_ctx: tx_ctx.clone(),
                tx_blob_count: blob_tx.blobs.len(),
            };
            match contract.handle(&calldata) {
                Err(e) => {
                    anyhow::bail!(
                        "Error while executing tx {} on blob index {} for {}: {e}",
                        blob_tx.hashed(),
                        calldata.index,
                        blob.contract_name
                    );
                }
                Ok(hyle_output) => {
                    if !hyle_output.success {
                        anyhow::bail!(
                            "Hyle output for tx {} on blob index {} for {} is not successful: {:?}",
                            blob_tx.hashed(),
                            calldata.index,
                            blob.contract_name,
                            String::from_utf8(hyle_output.program_outputs.clone())
                                .unwrap_or(hex::encode(&hyle_output.program_outputs)),
                        );
                    }
                    hyle_outputs.push((hyle_output, blob.contract_name.clone()));
                }
            }
        }
        // 3. Blobs execution went fine. Update actual contracts.
        for (contract_name, contract) in temp_contracts {
            contracts.insert(contract_name, contract);
        }
        Ok(hyle_outputs)
    }

    pub fn rerun_watched_contracts_from_settled(&mut self) -> Result<()> {
        let mut optimistic_commitments = BTreeMap::new();
        for contract_name in &self.watched_contracts {
            let commitment = self
                .optimistic_states
                .get(contract_name)
                .unwrap()
                .optimistic_commitments()?;
            optimistic_commitments.insert(contract_name.clone(), commitment);
        }
        // Revert each contract to the settled state.
        for (contract_name, state) in self.settled_states.clone() {
            self.optimistic_states
                .insert(contract_name.clone(), state.clone());
        }

        // Re-execute all sequenced_unsettled transactions
        for (blob_tx, tx_ctx) in self.unsettled_sequenced_txs.clone() {
            // A reexecution can fail. We do not want to crash here
            // What matters is the optimistic commitments comparaison
            let _ = log_warn!(
                Self::execute_blob_tx(&mut self.optimistic_states, &blob_tx, Some(tx_ctx.clone())),
                "Failed to re-execute sequenced tx"
            );
        }

        // Re-execute all unsequenced_unsettled transactions
        for (blob_tx, tx_ctx) in self.unsettled_unsequenced_txs.clone() {
            let _ = log_warn!(
                Self::execute_blob_tx(&mut self.optimistic_states, &blob_tx, Some(tx_ctx.clone())),
                "Failed to re-execute unsequenced tx"
            );
        }

        for contract_name in &self.watched_contracts {
            let new_commitment = self
                .optimistic_states
                .get(contract_name)
                .unwrap()
                .optimistic_commitments()?;
            if new_commitment != optimistic_commitments[contract_name] {
                anyhow::bail!(
                    "Optimistic state commitment for contract {} has changed after rerun",
                    contract_name
                );
            }
        }
        Ok(())
    }
}

impl RollupExecutorStore {
    fn deser_with(
        deser_store: DeserRollupExecutorStore,
        contract_deserializer: fn(Vec<u8>, &ContractName) -> ContractBox,
    ) -> Self {
        let settled_contracts = deser_store
            .settled_contracts
            .into_iter()
            .map(|(name, data)| {
                let c = contract_deserializer(data, &name);
                (name, c)
            })
            .collect();

        let optimistic_states = deser_store
            .optimistic_states
            .into_iter()
            .map(|(name, data)| {
                let c = contract_deserializer(data, &name);
                (name, c)
            })
            .collect();

        Self {
            validator_lane_id: deser_store.validator_lane_id,
            block_height: deser_store.block_height,
            watched_contracts: deser_store.watched_contracts,

            settled_states: settled_contracts,

            unsettled_sequenced_txs: deser_store.unsettled_sequenced_txs,
            unsettled_unsequenced_txs: deser_store.unsettled_unsequenced_txs,

            optimistic_states,
        }
    }
}
