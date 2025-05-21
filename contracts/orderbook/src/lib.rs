use borsh::{io::Error, BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use sdk::RunResult;

#[cfg(feature = "client")]
pub mod client;
#[cfg(feature = "client")]
pub mod indexer;

impl sdk::ZkContract for Orderbook {
    /// Entry point of the contract's logic
    fn execute(&mut self, calldata: &sdk::Calldata) -> RunResult {
        // Parse contract inputs
        let (action, ctx) = sdk::utils::parse_raw_calldata::<OrderbookAction>(calldata)?;

        // Execute the given action
        let res = match action {
            OrderbookAction::Increment => self.increment()?,
        };

        Ok((res, ctx, vec![]))
    }

    /// In this example, we serialize the full state on-chain.
    fn commit(&self) -> sdk::StateCommitment {
        sdk::StateCommitment(self.as_bytes().expect("Failed to encsode Balances"))
    }
}

impl Orderbook {
    pub fn increment(&mut self) -> Result<String, String> {
        self.n += 1;
        Ok(format!("Successfully incremented to {}", self.n))
    }
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct Orderbook {
    n: u128,
}

/// Enum representing possible calls to the contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum OrderbookAction {
    Increment,
}

impl OrderbookAction {
    pub fn as_blob(&self, contract_name: sdk::ContractName) -> sdk::Blob {
        sdk::Blob {
            contract_name,
            data: sdk::BlobData(borsh::to_vec(self).expect("Failed to encode OrderbookAction")),
        }
    }
}

impl Orderbook {
    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        borsh::to_vec(self)
    }
}

impl From<sdk::StateCommitment> for Orderbook {
    fn from(state: sdk::StateCommitment) -> Self {
        borsh::from_slice(&state.0)
            .map_err(|_| "Could not decode hyllar state".to_string())
            .unwrap()
    }
}
