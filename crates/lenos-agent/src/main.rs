fn main() {
    if let Err(e) = lenos_agent::run() {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
}
