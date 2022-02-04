import { Behavior, combineArray, replayLatest } from "@aelea/core"
import { $element, $node, $text, attr, component, style } from "@aelea/dom"
import { Route } from "@aelea/router"
import { $column, $row, layoutSheet, screenUtils, state } from "@aelea/ui-components"
import { pallete } from "@aelea/ui-components-theme"
import { TREASURY_ARBITRUM, TREASURY_AVALANCHE, USD_PRECISION } from "@gambitdao/gbc-middleware"
import { intervalInMsMap, formatFixed, ARBITRUM_CONTRACT, BASIS_POINTS_DIVISOR, IAccountQueryParamApi, ITimerange } from "@gambitdao/gmx-middleware"
import { CHAIN, getAccountExplorerUrl, IWalletLink } from "@gambitdao/wallet-link"
import { combine, empty, fromPromise, map, multicast, switchLatest, take } from "@most/core"
import { $anchor, $responsiveFlex } from "../elements/$common"
import { gmxGlpPriceHistory, queryArbitrumRewards, queryAvalancheRewards, StakedTokenArbitrum, StakedTokenAvalanche } from "../logic/query"

import { $tokenIconMap } from "../common/$icons"
import { $AssetDetails, readableNumber } from "../components/$AssetDetails"
import { IAsset, ITreasuryStore } from "../types"
import { $StakingGraph } from "../components/$StakingGraph"
import { arbitrumContract, avalancheContract } from "../logic/gbcTreasury"
import { Stream } from "@most/types"
import { latestTokenPriceMap, priceFeedHistoryInterval } from "../logic/common"
import { $AccountPreview } from "../components/$AccountProfile"
import { $metricEntry, $seperator2 } from "./common"

const GRAPHS_INTERVAL = Math.floor(intervalInMsMap.HR4 / 1000)

export interface ITreasury {
  walletLink: IWalletLink
  parentRoute: Route
  treasuryStore: state.BrowserStore<ITreasuryStore, "treasuryStore">
}




export const $Treasury = ({ walletLink, parentRoute, treasuryStore }: ITreasury) => component((
  [trasnferPopup, trasnferPopupTether]: Behavior<any, any>,
) => {


  const queryParams: IAccountQueryParamApi & Partial<ITimerange> = {
    from: treasuryStore.state.startedStakingGmxTimestamp || undefined,
    account: TREASURY_ARBITRUM
  }


  const arbitrumStakingRewards = replayLatest(multicast(arbitrumContract.stakingRewards))
  const avalancheStakingRewards = replayLatest(multicast(avalancheContract.stakingRewards))
  const pricefeedQuery = replayLatest(multicast(fromPromise(gmxGlpPriceHistory(queryParams))))
 
  const arbitrumYieldSourceMap = replayLatest(multicast(fromPromise(queryArbitrumRewards(queryParams))))
  const avalancheYieldSourceMap = replayLatest(multicast(fromPromise(queryAvalancheRewards({ ...queryParams, account: TREASURY_AVALANCHE }))))



  const ethAsset: Stream<IAsset> = combine((bn, priceMap) => ({ balance: bn.gmxInStakedGmxUsd, balanceUsd: bn.gmxInStakedGmxUsd * priceMap.gmx.value / USD_PRECISION }), arbitrumStakingRewards, latestTokenPriceMap)
  const gmxAsset: Stream<IAsset> = combine((bn, priceMap) => {
    return { balance: bn.gmxInStakedGmx, balanceUsd: bn.gmxInStakedGmx * priceMap.gmx.value / USD_PRECISION }
  }, arbitrumStakingRewards, latestTokenPriceMap)
  const glpArbiAsset: Stream<IAsset> = combine((bn, priceMap) => ({ balance: bn.glpBalance, balanceUsd: priceMap.glpArbitrum.value * bn.glpBalance / USD_PRECISION }), arbitrumStakingRewards, latestTokenPriceMap)
  const glpAvaxAsset: Stream<IAsset> = combine((bn, priceMap) => ({ balance: bn.glpBalance, balanceUsd: priceMap.glpArbitrum.value * bn.glpBalance / USD_PRECISION }), avalancheStakingRewards, latestTokenPriceMap)




  const feeYieldClaim = combineArray((arbiStaking, avaxStaking) => [...arbiStaking.feeGlpTrackerClaims, ...arbiStaking.feeGmxTrackerClaims, ...avaxStaking.feeGlpTrackerClaims, ...avaxStaking.feeGmxTrackerClaims], arbitrumYieldSourceMap, avalancheYieldSourceMap)
  const newLocal = take(1, latestTokenPriceMap)
  const yieldClaim = combineArray((arbiStaking, avaxStaking, yieldFeeList, priceMap) => {
    // amountUsd from avalanche is not reflecting the real amount because the subraph's gmx price is 0
    // to fix this, we'll fetch arbitrum's price of GMX instead
    const avaxYieldGmx = [...avaxStaking.stakedGlpTrackerClaims, ...avaxStaking.stakedGmxTrackerClaims]
      .map(y => ({ ...y, amountUsd: y.amount * priceMap.gmx.value / USD_PRECISION }))

    return [
      ...yieldFeeList,
      ...avaxYieldGmx,
      ...arbiStaking.stakedGlpTrackerClaims,
      ...arbiStaking.stakedGmxTrackerClaims
    ]
  }, arbitrumYieldSourceMap, avalancheYieldSourceMap, feeYieldClaim, newLocal)
  

  const gmxArbitrumRS = priceFeedHistoryInterval(
    GRAPHS_INTERVAL,
    map(feedMap => feedMap.gmx, pricefeedQuery),
    map(staking => staking.stakes.filter(s => s.token === StakedTokenArbitrum.GMX || s.token === StakedTokenArbitrum.esGMX), arbitrumYieldSourceMap)
  )

  const glpArbitrumRS = priceFeedHistoryInterval(
    GRAPHS_INTERVAL,
    map(feedMap => feedMap.glpArbitrum, pricefeedQuery),
    map(staking => staking.stakes.filter(s => s.token === StakedTokenArbitrum.GLP), arbitrumYieldSourceMap)
  )

  const glpAvalancheRS = priceFeedHistoryInterval(
    GRAPHS_INTERVAL,
    map(feedMap => feedMap.glpAvalanche, pricefeedQuery),
    map(staking => staking.stakes.filter(s => s.token === StakedTokenAvalanche.GLP), avalancheYieldSourceMap)
  )


  return [
    $column(layoutSheet.spacingBig)(

      $StakingGraph({
        valueSource: [gmxArbitrumRS, glpArbitrumRS, glpAvalancheRS],
        stakingYield: yieldClaim,
        arbitrumStakingRewards,
        avalancheStakingRewards,
        walletLink,
        priceFeedHistoryMap: pricefeedQuery,
        graphInterval: GRAPHS_INTERVAL,
      })({}),
      
      $node(),


      $column(layoutSheet.spacing, style({}))(
        $text(style({ fontWeight: 'bold', fontSize: '1.25em' }))('Yielding Assets'),

        $column(layoutSheet.spacing, style({ flex: 2 }))(
          screenUtils.isDesktopScreen
            ? $row(layoutSheet.spacingBig, style({ color: pallete.foreground, fontSize: '.75em' }))(
              $text(style({ flex: 1 }))('Holdings'),
              $row(layoutSheet.spacingBig, style({ flex: 3 }))(
                $text(style({ flex: 1 }))('Price History'),
                $text(style({ flex: 1, maxWidth: '300px' }))('Distribution')
              ),
            ) : empty(),
          $column(layoutSheet.spacingBig)(
            $AssetDetails({
              label: 'GMX',
              symbol: 'GMX',
              chain: CHAIN.ARBITRUM,
              asset: gmxAsset,
              priceChart: gmxArbitrumRS,
              $distribution: switchLatest(map(({  bnGmxInFeeGmx, bonusGmxInFeeGmx, gmxAprForEthPercentage, gmxAprForEsGmxPercentage }) => {
                const boostBasisPoints = formatFixed(bnGmxInFeeGmx * BASIS_POINTS_DIVISOR / bonusGmxInFeeGmx, 2)
          
                return $column(layoutSheet.spacingSmall, style({ flex: 1, }))(
                  $metricEntry(`esGMX`, `${formatFixed(gmxAprForEsGmxPercentage, 2)}%`),
                  $metricEntry(`ETH`, `${formatFixed(gmxAprForEthPercentage, 2)}%`),
                  $metricEntry(`Compounding Bonus`, `${boostBasisPoints}%`),
                  $metricEntry(`Compounding Multiplier`, `${readableNumber(formatFixed(bnGmxInFeeGmx, 18))}`),
                )
              }, arbitrumStakingRewards)),
              $iconPath: $tokenIconMap[ARBITRUM_CONTRACT.GMX],
            })({}),
            $seperator2,
            $AssetDetails({
              label: 'GLP',
              symbol: 'GLP',
              chain: CHAIN.ARBITRUM,
              asset: glpArbiAsset,
              priceChart: glpArbitrumRS,
              $distribution: switchLatest(map(({ glpAprForEsGmxPercentage, glpAprForEthPercentage,   }) => {

                return $column(layoutSheet.spacingSmall, style({ flex: 1 }))(
                  $metricEntry(`esGMX`, `${formatFixed(glpAprForEsGmxPercentage, 2)}%`),
                  $metricEntry(`ETH`, `${formatFixed(glpAprForEthPercentage, 2)}%`),
                )
              }, arbitrumStakingRewards)),
              $iconPath: $tokenIconMap[ARBITRUM_CONTRACT.GLP],
            })({}),
            $seperator2,
            $AssetDetails({
              label: 'GLP',
              symbol: 'GLP',
              chain: CHAIN.AVALANCHE,
              asset: glpAvaxAsset,
              priceChart: glpAvalancheRS,
              $distribution: switchLatest(map(({ glpAprForEsGmxPercentage, glpAprForEthPercentage,   }) => {

                return $column(layoutSheet.spacingSmall, style({ flex: 1 }))(
                  $metricEntry(`esGMX`, `${formatFixed(glpAprForEsGmxPercentage, 2)}%`),
                  $metricEntry(`AVAX`, `${formatFixed(glpAprForEthPercentage, 2)}%`),
                )
              }, avalancheStakingRewards)),
              $iconPath: $tokenIconMap[ARBITRUM_CONTRACT.GLP],
            })({}),
          ),
        ),
      ),

      $node(),


      $column(layoutSheet.spacing)(
        $text(style({ fontWeight: 'bold', fontSize: '1.25em' }))('Treasury Vaults'),
        $node(
          $text('The Treasury Vaults are secured using a Multi-Signature using a 3/5 threshold allowing full control to perform actions like Staking for yield, Asset Rebalancing and more. powered by '),
          $anchor(style({ display: 'inline' }), attr({ href: 'https://gnosis.io/safe/' }))($text('Gnosis Safe')),
        ),
        
        $node(),

        $responsiveFlex(layoutSheet.spacing, style({ alignItems: 'center', placeContent: 'space-between' }))(
          $row(layoutSheet.spacingSmall)(
            $AccountPreview({
              address: TREASURY_ARBITRUM,
            })({}),
            $anchor(attr({ href: getAccountExplorerUrl(CHAIN.ARBITRUM, TREASURY_ARBITRUM) }))(
              $element('img')(attr({ src: `/assets/arbitrum.svg` }), style({ width: '28px', padding: '3px', borderRadius: '50%', backgroundColor: pallete.background }))()
            ),
          ),

          $row(layoutSheet.spacingBig)(
            $text(style({ color: pallete.foreground }))('Signers:'),
            $teamSigner({
              name :'xm92boi'
            }),
            $teamSigner({
              name :'0xAppodial'
            }),
            $teamSigner({
              name :'itburnzz'
            }),
            $teamSigner({
              name :'B2F_zer'
            }),
            $teamSigner({
              name :'xdev_10'
            }),
          )
        ),

        $seperator2,

        $responsiveFlex(layoutSheet.spacing, style({ alignItems: 'center', placeContent: 'space-between' }))(
          $row(layoutSheet.spacingSmall)(
            $AccountPreview({
              address: TREASURY_AVALANCHE,
            })({}),
            $anchor(attr({ href: getAccountExplorerUrl(CHAIN.AVALANCHE, TREASURY_AVALANCHE) }))(
              $element('img')(attr({ src: `/assets/avalanche.svg` }), style({ width: '28px', padding: '3px', borderRadius: '50%', backgroundColor: pallete.background }))()
            )
          ),


          $row(layoutSheet.spacingBig)(
            $text(style({ color: pallete.foreground }))('Signers:'),
            $teamSigner({
              name :'xm92boi'
            }),
            $teamSigner({
              name :'0xAppodial'
            }),
            $teamSigner({
              name :'itburnzz'
            }),
            $teamSigner({
              name :'B2F_zer'
            }),
            $teamSigner({
              name :'xdev_10'
            }),
          )
        ),


   
      ),
      
    )
  ]
})

export const $teamSigner = ({ name }: {name: string}) => $row(layoutSheet.spacingTiny, style({ alignItems: 'center', fontSize: screenUtils.isDesktopScreen ? '' : '65%' }))(
  $element('img')(style({ width: '20px', borderRadius: '22px' }), attr({ src: `https://unavatar.vercel.app/twitter/${name}`, }))(),
  $anchor(attr(({ href: `https://twitter.com/${name}` })), style({ fontWeight: 900, textDecoration: 'none', fontSize: '.75em' }))($text(`@${name}`)),
)



