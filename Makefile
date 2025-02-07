############################# HELP MESSAGE #############################
# Make sure the help command stays first, so that it's printed by default when `make` is called without arguments
.PHONY: help tests
help:
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

AGGREGATOR_ECDSA_PRIV_KEY=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
CHALLENGER_ECDSA_PRIV_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
RPC_URL=http://localhost:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

CHAINID=31337
# Make sure to update this if the strategy address changes
# check in contracts/script/output/${CHAINID}/credible_squaring_avs_deployment_output.json
STRATEGY_ADDRESS=0x7a2088a1bFc9d81c55368AE168C2C02570cB814F
DEPLOYMENT_FILES_DIR=contracts/script/output/${CHAINID}

-----------------------------: ## 

___CONTRACTS___: ## 

build-contracts: ## builds all contracts
	cd contracts && forge build

generate-abi: build-contracts ## Generate ABI files
	mkdir -p abis
	cp contracts/out/AiAgentTaskManager.sol/AiAgentTaskManager.json abis/
	cp contracts/out/AiAgentServiceManager.sol/AiAgentServiceManager.json abis/
	cp contracts/out/ERC20Mock.sol/ERC20Mock.json abis/

clean-contracts: ## cleans all contracts
	cd contracts && forge clean
test-contracts: ## tests all contracts
	cd contracts && forge test
deploy-contracts: generate-abi ## deploys all contracts and generates ABIs
	cd contracts && forge script script/AiAgentDeployer.s.sol --rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY) --broadcast -v
	@echo "Copying deployment addresses..."
	cp contracts/script/output/31337/AiAgent_avs_deployment_output.json abis/

deploy-eigenlayer-contracts-to-anvil-and-save-state: ## Deploy eigenlayer
	./scripts/anvil/deploy-eigenlayer-save-anvil-state.sh

deploy-aiagent-contracts-to-anvil-and-save-state: ## Deploy avs
	./scripts/anvil/deploy-avs-save-anvil-state.sh

deploy-all-to-anvil-and-save-state: deploy-eigenlayer-contracts-to-anvil-and-save-state deploy-aiagent-contracts-to-anvil-and-save-state ## deploy eigenlayer, shared avs contracts, and inc-sq contracts 

start-anvil-chain-with-el-and-avs-deployed: ## starts anvil from a saved state file (with el and avs contracts deployed)
	./scripts/anvil/start-anvil-chain-with-el-and-avs-deployed.sh

__CLI__: ## 

send-fund: ## sends fund to the operator saved in src/keys/test.ecdsa.key.json
	cast send 0x860B6912C2d0337ef05bbC89b0C2CB6CbAEAB4A5 --value 10ether --private-key $(PRIVATE_KEY) --rpc-url $(RPC_URL)

-----------------------------: ## 
# We pipe all zapper logs through https://github.com/maoueh/zap-pretty so make sure to install it
# TODO: piping to zap-pretty only works when zapper environment is set to production, unsure why
____OFFCHAIN_SOFTWARE___: ## 
start-judge: ## 
	npm run start:judge

start-juror: ## 
	npm run start:juror

get-deployment-info: ## Print deployment addresses and ABIs location
	@echo "ABIs location: ./abis/"
	@echo "Deployment addresses: ./abis/AiAgent_avs_deployment_output.json"

