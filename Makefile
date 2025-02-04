.PHONY: build-contracts start-anvil-chain-with-el-and-avs-deployed install clean test format lint

# Build contracts using foundry
build-contracts:
	cd contracts && forge build

# Start local anvil chain with saved state
start-anvil-chain-with-el-and-avs-deployed:
	anvil --load-state scripts/anvil/avs-and-eigenlayer-deployed-anvil-state.json

# Install dependencies
install:
	npm install
	cd contracts && forge install

# Clean build artifacts
clean:
	rm -rf node_modules
	cd contracts && forge clean

# Run tests
test:
	npm test
	cd contracts && forge test

# Format code
format:
	npm run format
	cd contracts && forge fmt

# Lint code
lint:
	npm run lint 