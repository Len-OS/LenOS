#[tokio::main]
async fn main() {
    std::process::exit(lenos_cli::run_from_args(std::env::args()).await);
}
