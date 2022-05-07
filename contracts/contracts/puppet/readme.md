# GBC Mirror Trading, Powered by Puppet

Day Trading is one of world's hardest skill to ascertain, it requires the knowledge and understanding in risk, research, cycles/patterns, Price Action and mitigating trading based on emotions or crowd following.

There are 2 participant types. Trader and Puppet. Traders gets additional profit and clout based on their performance while Puppets search for traders that are likely to generate profit using the leaderboard by mirroring their trading strategy. 
We propose a utility that attempts to share the benefits between both participants, we think it's possible using GMX as protocol.

Our platform will accesses all of the trading activity that is happening on <https://blueberry.club> through <https://gmx.io> contracts. This allows the visibility of any trader's historic performance. We use the data to build a platform that allow users the ability to pick and choose traders that are likely to give them profit by mirroring their trading strategy.

to ensure Traders have Skin in the game (risk) they are required to deposit funds and, based on the amount they deposit they will be able use amount of Puppet's deposited funds. If a trader opens a trade using 100% of his deposited tokens in the Mirror Account this means he reached his limit. He will have to add additional funds or settle opened position in order to open a position of the same token.

We will also launch monthly tournaments, is an on-going draft, see (needs update to reflect Mirror Trading) <https://docs.google.com/document/d/1raoPyVwOSWPdy7HWzEuFt__2KNHigSC-sVYJ8tkJZSY/edit?usp=sharing>

## Trader

### Trader features

- Opens GMX leveraged trades. successful trades win the profit and receive additional fee per Puppet
- Ranked on a leaderboard that displays historic records. Successful track record increases exposure
- Controls additional liquidity given by each Puppet based on his allocation in the contract
- Achieve clout, build a community and gather followers by providing twitter/reddit info

### Trader actions

- Create Mirror Account (Lab profile required)
- Specify route rules ETH <> USDC, BTC <> USDC
  - Define which tokens can be traded. In this case only ETH and BTC long and short can be opened
- Deposit routed tokens
  - Minimum $10 in one of routed tokens
  - Can use a Puppet funds based on his deposited token amount or less
  - If the Trader has opened position using 100% he deposited, he will have to deposit additional funds or settle his open positions
- Open/modify/close GMX positions (increasePosition, decreasePosition)
  - Open/close a trade: update funds allocation of Trader and his Puppet's funds in the contract
  - When a trade gets liquidated.. TBD, find a way to get the remaining liquidity to update funds allocation
- Withdraw a token from the contract. Unused allocated funds in the contract will be sent to his wallet

## Puppet

### Puppet features

- Transfer responsibility to a trader by mirroring their trading strategy
- Deposit tokens into a single Vault
- Leaderboard to allow visibility into Traders historic track record
- Search for traders that are likely to generate profit using the leaderboard
- Balance risk by Mirroring multiple traders based on configured threshold
- Successful trades receive the profit and pays a small fee to the trader

### Puppet actions

- Deposit token into the contract
- Mirror a trader(Lab profile required) by setting a token threshold
  - Has to have > $10 allocation in one of routed tokens
- Set a Mirror Account exposure threshold, 0-1
  - Threshold will reduce the amount the Trader can use
  - Case: both have 10 ETH, .5 threshold set by Puppet, Trader opens a trade using 50% of his group's pool. Result would be 7.5 ETH collateral trade (5 + 5 * .5)
    - An issue could happen if the trader has opened 5 ETH trade. He could deposit additional funds and use another 2.5 ETH and repeat this process
- Switch take profit on/off(default) after trade settles(close, liquidate)
  - Off: update net-value contract token allocation
  - On: send net-value token to Puppet's wallet
- Withdraw a token from the contract. Unused allocated funds will be sent to his wallet
