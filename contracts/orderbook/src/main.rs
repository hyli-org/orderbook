#![no_main]

use orderbook::Orderbook;
use sdk::{
    guest::{execute, GuestEnv, SP1Env},
    Calldata,
};

sp1_zkvm::entrypoint!(main);

fn main() {
    let env = SP1Env {};
    let (commitment_metadata, calldata): (Vec<u8>, Vec<Calldata>) = env.read();

    let output = execute::<Orderbook>(&commitment_metadata, &calldata);
    env.commit(output);
}
