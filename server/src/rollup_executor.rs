use anyhow::Result;
use borsh::{BorshDeserialize, BorshSerialize};
use client_sdk::transaction_builder::TxExecutorHandler;
use hyle_modules::{
    bus::{BusClientSender, SharedMessageBus},
    log_error, module_bus_client, module_handle_messages,
    modules::Module,
};
use sdk::{
    BlobTransaction, Calldata, ContractName, Hashed, HyleOutput, LaneId, MempoolStatusEvent,
    NodeStateEvent, TransactionData, TxContext, TxHash,
};
use std::collections::HashSet;
use std::{
    fmt::Debug,
    ops::{Deref, DerefMut},
    path::PathBuf,
    vec,
};
use tracing::info;

pub struct RollupExecutor<Contract: Send + Sync + Clone + 'static> {
    bus: RollupExecutorBusClient<Contract>,
    data_directory: PathBuf,
    store: RollupExecutorStore<Contract>,
}

impl<Contract: Send + Sync + Clone + 'static> Deref for RollupExecutor<Contract> {
    type Target = RollupExecutorStore<Contract>;

    fn deref(&self) -> &Self::Target {
        &self.store
    }
}

impl<Contract: Send + Sync + Clone + 'static> DerefMut for RollupExecutor<Contract> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.store
    }
}

#[derive(Default, BorshSerialize, BorshDeserialize)]
pub struct RollupExecutorStore<Contract> {
    validator_lane_id: LaneId,
    contract_name: ContractName,
    unsettled_txs: Vec<(BlobTransaction, TxContext)>,
    state_history: Vec<(TxHash, Contract)>,
    contract: Contract,
}

pub struct RollupExecutorCtx<Contract> {
    pub data_directory: PathBuf,
    pub contract_name: ContractName,
    pub default_state: Contract,
    pub validator_lane_id: LaneId,
}

#[derive(Debug, Clone)]
pub enum RollupExecutorEvent<Contract> {
    /// Event sent when a blob is executed as successfully
    #[allow(dead_code)]
    TxExecutionSuccess(BlobTransaction, Contract, Vec<HyleOutput>),
    /// Event sent when a blob is reverted
    /// After a revert, the contract state is recalculated
    #[allow(dead_code)]
    RevertedTx(BlobTransaction, Contract),
}

module_bus_client! {
#[derive(Debug)]
pub struct RollupExecutorBusClient<Contract: Send + Sync + Clone + 'static> {
    sender(RollupExecutorEvent<Contract>),
    receiver(NodeStateEvent),
    receiver(MempoolStatusEvent),
}
}
impl<Contract> Module for RollupExecutor<Contract>
where
    Contract: TxExecutorHandler
        + BorshSerialize
        + BorshDeserialize
        + Debug
        + Send
        + Sync
        + Clone
        + 'static,
{
    type Context = RollupExecutorCtx<Contract>;

    async fn build(bus: SharedMessageBus, ctx: Self::Context) -> Result<Self> {
        let bus = RollupExecutorBusClient::<Contract>::new_from_bus(bus.new_handle()).await;

        let data_directory = ctx.data_directory.clone();
        let file =
            data_directory.join(format!("rollup_executor_{}.bin", ctx.contract_name).as_str());

        let store = match Self::load_from_disk::<RollupExecutorStore<Contract>>(file.as_path()) {
            Some(store) => store,
            None => RollupExecutorStore::<Contract> {
                contract: ctx.default_state.clone(),
                unsettled_txs: Vec::new(),
                state_history: Vec::new(),
                validator_lane_id: ctx.validator_lane_id.clone(),
                contract_name: ctx.contract_name.clone(),
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
            Self::save_on_disk::<RollupExecutorStore<Contract>>(
                self.data_directory
                    .join(format!("rollup_executor_{}.bin", self.contract_name))
                    .as_path(),
                &self.store,
            ),
            "Saving prover"
        );

        Ok(())
    }
}

impl<Contract> RollupExecutor<Contract>
where
    Contract: TxExecutorHandler + Debug + Clone + Send + Sync + 'static,
{
    async fn handle_node_state_event(&mut self, event: NodeStateEvent) -> Result<()> {
        match event {
            NodeStateEvent::NewBlock(block) => {
                self.handle_successful_transactions(block.successful_txs);

                // Handling failed and timed out transactions
                let merged_set: HashSet<_> = block
                    .timed_out_txs
                    .iter()
                    .chain(block.failed_txs.iter())
                    .cloned()
                    .collect();
                for tx_hash in merged_set.iter() {
                    // Cancel the transaction and recalculate the state
                    let blob_tx = self.cancel_tx(tx_hash)?;
                    // Notify the bus about the failed transaction and send the new computed state
                    self.bus.send(RollupExecutorEvent::RevertedTx(
                        blob_tx,
                        self.contract.clone(),
                    ))?;
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
                    ..Default::default()
                });
                if let TransactionData::Blob(blob_tx) = tx.transaction_data {
                    let hyle_outputs = self.execute_blob_tx(&blob_tx, tx_ctx)?;
                    info!(
                        cn =% self.contract_name,
                        tx_hash =% blob_tx.hashed(),
                        succcesses =? hyle_outputs.iter().map(|o| o.success).collect::<Vec<bool>>(),
                        "🔧 Executed contract"
                    );
                    // Notify the bus about the successful transaction and send the new computed state
                    // WARNING: If the transaction HyleOuput's success is false, it will be sent indiscriminately
                    self.bus.send(RollupExecutorEvent::TxExecutionSuccess(
                        blob_tx,
                        self.contract.clone(),
                        hyle_outputs,
                    ))?;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

impl<Contract> RollupExecutorStore<Contract>
where
    Contract: TxExecutorHandler + Debug + Clone + Send + Sync + 'static,
{
    /// This function executes the blob transaction and returns the outputs of the contract.
    /// It also keeps track of the transaction as unsettled and the state history.
    pub fn execute_blob_tx(
        &mut self,
        blob_tx: &BlobTransaction,
        tx_ctx: Option<TxContext>,
    ) -> anyhow::Result<Vec<HyleOutput>> {
        let initial_state = self.contract.clone();

        let mut hyle_outputs = vec![];

        for (blob_index, blob) in blob_tx.blobs.iter().enumerate() {
            // Filter out blobs that are not for the orderbook contract
            if blob.contract_name == self.contract_name {
                let calldata = Calldata {
                    identity: blob_tx.identity.clone(),
                    tx_hash: blob_tx.hashed(),
                    private_input: vec![],
                    blobs: blob_tx.blobs.clone().into(),
                    index: blob_index.into(),
                    tx_ctx: tx_ctx.clone(),
                    tx_blob_count: blob_tx.blobs.len(),
                };
                // Execute the blob
                match self.contract.handle(&calldata) {
                    Err(e) => {
                        // Transaction is invalid, we need to revert the state
                        self.contract = initial_state;
                        anyhow::bail!(
                            "Error while executing tx {} on blob index {} for {}: {e}",
                            blob_tx.hashed(),
                            calldata.index,
                            self.contract_name
                        );
                    }
                    Ok(hyle_output) => {
                        hyle_outputs.push(hyle_output);
                    }
                }
            }
        }
        // Blobs execution went fine.
        // We keep track of the transaction as unsettled
        self.unsettled_txs
            .push((blob_tx.clone(), tx_ctx.clone().unwrap()));
        // We also keep track of the state history
        self.state_history
            .push((blob_tx.hashed(), self.contract.clone()));

        Ok(hyle_outputs)
    }

    /// This function is called when the transaction is confirmed as failed.
    /// It reverts the state and reexecutes all unsettled transaction after this one.
    pub fn cancel_tx(&mut self, tx_hash: &TxHash) -> anyhow::Result<BlobTransaction> {
        let tx_pos = self
            .unsettled_txs
            .iter()
            .position(|(blob_tx, _)| blob_tx.hashed() == *tx_hash)
            .ok_or(anyhow::anyhow!(
                "Transaction not found in unsettled transactions"
            ))?;

        let (poped_tx, _) = self.unsettled_txs.remove(tx_pos);

        // Revert the contract state to the state before the cancelled transaction
        if let Some((_, state)) = self.state_history.get(tx_pos) {
            self.contract = state.clone();
            // Remove all state history after and including tx_pos
            self.state_history.truncate(tx_pos);
        } else {
            anyhow::bail!("State history not found for the cancelled transaction");
        }

        // Re-execute all unsettled transactions after the cancelled one
        let reexecute_txs: Vec<(BlobTransaction, TxContext)> =
            self.unsettled_txs.drain(tx_pos..).collect();
        for (blob_tx, tx_ctx) in reexecute_txs.iter() {
            // Ignore outputs, just update state and unsettled_txs/state_history
            let _ = self.execute_blob_tx(blob_tx, Some(tx_ctx.clone()))?;
        }
        Ok(poped_tx)
    }

    fn handle_successful_transactions(&mut self, successful_txs: Vec<TxHash>) {
        for tx_hash in successful_txs {
            // Remove the transaction from unsettled transactions
            if let Some(pos) = self
                .unsettled_txs
                .iter()
                .position(|(tx, _)| tx.hashed() == tx_hash)
            {
                self.unsettled_txs.remove(pos);
            }
            // Add the state to the history
            self.state_history.push((tx_hash, self.contract.clone()));
        }
    }
}
