mod metadata {
    use sp1_sdk::include_elf;

    pub const ORDERBOOK_ELF: &[u8] = include_elf!("orderbook");
}

pub use metadata::*;
