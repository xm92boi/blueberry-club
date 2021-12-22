import { Behavior, combineArray, replayLatest } from "@aelea/core"
import { $text, attr, component, motion, MOTION_NO_WOBBLE, style } from "@aelea/dom"
import { Route } from "@aelea/router"
import { $column, $NumberTicker, $row, $seperator, layoutSheet, screenUtils, state } from "@aelea/ui-components"
import { colorAlpha, pallete } from "@aelea/ui-components-theme"
import { USD_PRECISION } from "@gambitdao/gbc-middleware"
import { expandDecimals, intervalInMsMap, unixTimeTzOffset, shortenAddress, formatFixed, ARBITRUM_ADDRESS, BASIS_POINTS_DIVISOR } from "@gambitdao/gmx-middleware"
import { IWalletLink } from "@gambitdao/wallet-link"
import { empty, fromPromise, map, multicast, now, skipRepeats, skipRepeatsWith, startWith, switchLatest } from "@most/core"
import { BarPrice, CrosshairMode, LastPriceAnimationMode, LineStyle, MouseEventParams, PriceScaleMode, SeriesMarker, Time } from "lightweight-charts-baseline"
import { $Chart } from "../components/chart/$Chart"
import { $anchor, $card } from "../elements/$common"
import { fillIntervalGap } from "../logic/common"
import { gmxGlpPriceHistory, IGlpStat, IStake, IUniswapSwap, queryStakingEvents } from "../logic/query"
import { accountTokenBalances, stakingRewards } from "../logic/contract"
import { $tokenIconMap } from "../common/$icons"
import { $AssetDetails, readableNumber } from "../components/$AssetDetails"
import { ITreasuryStore } from "../types"



export function bnToHex(n: bigint) {
  return '0x' + n.toString(16)
}




interface ITreasury {
  walletLink: IWalletLink
  parentRoute: Route
  treasuryStore: state.BrowserStore<ITreasuryStore, "treasuryStore">
  // walletStore: cstate.BrowserStore<"metamask" | "walletConnect" | null, "walletStore">
}


interface ITreasuryTick {
  time: number
  value: number
  cumulativeReward: number
  amountGmx: bigint
  amountGlp: bigint
  balanceEth: bigint
  balanceGmx: bigint
  balanceGlp: bigint
  gmxPrice: bigint
  glpPrice: bigint
}


export const $Treasury = ({ walletLink, parentRoute, treasuryStore }: ITreasury) => component((
  [trasnferPopup, trasnferPopupTether]: Behavior<any, any>,
  [pnlCrosshairMove, pnlCrosshairMoveTether]: Behavior<MouseEventParams, MouseEventParams>,
) => {


  const treasuryRef = $anchor(attr({ href: 'https://arbiscan.io/address/0xDe2DBb7f1C893Cc5E2f51CbFd2A73C8a016183a0' }), style({ fontSize: '.75em' }))(
    $text(shortenAddress('0xDe2DBb7f1C893Cc5E2f51CbFd2A73C8a016183a0'))
  )

  
  const stakingRewardsState = replayLatest(multicast(stakingRewards))
  const stakingEvents = treasuryStore.store(
    replayLatest(multicast(fromPromise(queryStakingEvents({})))),
    map(data => {
      return {
        startedStakingGlpTimestamp: data.stakeGlps[data.stakeGlps.length - 1].timestamp,
        startedStakingGmxTimestamp: data.stakeGmxes[data.stakeGmxes.length - 1].timestamp
      }
    })
  )
  const newLocal = treasuryStore.state.startedStakingGmxTimestamp ? {
    from: treasuryStore.state.startedStakingGmxTimestamp
    // from: Math.floor(nowDate.setFullYear(nowDate.getFullYear() - 1) / 1000),
    // to: Math.floor(Date.now() / 1000)
  } : {}
  const gmxPriceHistoryquery = replayLatest(multicast(fromPromise(gmxGlpPriceHistory(newLocal))))

  const gmxPriceInterval = map(({ uniswapPrices }) => {
    const oldestTick = uniswapPrices[uniswapPrices.length - 1]
    const seed = {
      time: getTime(oldestTick),
      value: formatFixed(BigInt(oldestTick.value), 30)
    }

    const price = fillIntervalGap({
      seed, getTime,
      source: [...uniswapPrices].sort((a, b) => getTime(a) - getTime(b)),
      interval: Math.floor(intervalInMsMap.MIN30 / 1000),
      fillMap: (prev, next) => {
        return { time: next.timestamp, value: formatFixed(BigInt(next.value), 30) }
      },
    })

    const initTs = treasuryStore?.state.startedStakingGmxTimestamp || 0
    const match = uniswapPrices.find(a => {
      return initTs > a.timestamp
    })

    const baselinePrice = match?.value ? formatFixed(BigInt(match.value), 30) : seed.value

    return { series: price, baselinePrice }
  }, gmxPriceHistoryquery)

  const glpPriceInterval = map(({ glpStats }) => {
    const oldestTick = glpStats[glpStats.length - 1]
    const seed = {
      time: getTime(oldestTick),
      value: formatFixed(getGlpPrice(oldestTick), 18)
    }
    const price = fillIntervalGap({
      seed, getTime,
      source: [...glpStats].sort((a, b) => getTime(a) - getTime(b)),
      interval: Math.floor(intervalInMsMap.MIN30 / 1000),
      fillMap: (prev, next) => {
        const time = Number(next.id)
        const value = formatFixed(getGlpPrice(next), 30)
        return { time, value }
      },
    })

    const initTs = treasuryStore?.state.startedStakingGlpTimestamp || 0
    const match = oldestTick
    // const match = glpStats.find(a => {
    //   return initTs > Number(a.id)
    // })

    const baselinePrice = match ? formatFixed(getGlpPrice(match), 30) : seed.value

    return { series: price, baselinePrice }
  }, gmxPriceHistoryquery)

  const fillRewards = (prev: ITreasuryTick, next: IUniswapSwap | IStake | IGlpStat): ITreasuryTick => {
    if (next.__typename === 'StakeGmx') {
      const stakedAmountGmx = prev.amountGmx + BigInt(next.amount)

      const addedGmxUsd = formatFixed(prev.gmxPrice * BigInt(next.amount) / USD_PRECISION, 30)
      const isWalletStaked = addedGmxUsd > 1000

      const cumulativeReward = !isWalletStaked ? prev.cumulativeReward + addedGmxUsd : prev.cumulativeReward

      const balanceGmx = (prev.gmxPrice * stakedAmountGmx / USD_PRECISION)

      const cumulative = formatFixed(balanceGmx + prev.balanceGlp + prev.balanceEth, 30)
      const value = isWalletStaked ? cumulative : prev.value


      return { ...prev, time: next.timestamp, value, cumulativeReward, balanceGmx, amountGmx: stakedAmountGmx }
    }

    if (next.__typename === 'StakeGlp') {
      const amountGlp = BigInt(next.amount)
      const balanceGlp = expandDecimals((prev.glpPrice * amountGlp / USD_PRECISION), 12)
      
      const value = formatFixed(balanceGlp + prev.balanceGmx + prev.balanceEth, 30)

      return { ...prev, time: next.timestamp, value, amountGlp, balanceGlp }
    }

    if (next.__typename === 'UniswapPrice') {
      const balanceGmx = (prev.gmxPrice * prev.amountGmx / USD_PRECISION)
      const value = formatFixed(balanceGmx + prev.balanceGlp + prev.balanceEth, 30)

      return { ...prev, time: next.timestamp, value, gmxPrice: BigInt(next.value) }
    }

    if (next.__typename === 'GlpStat') {
      const glpPrice = getGlpPrice(next)
      const balanceGlp = expandDecimals((glpPrice * prev.amountGlp / USD_PRECISION), 12)
      const gmxBalance = prev.balanceGmx

      const value = formatFixed(gmxBalance + balanceGlp + prev.balanceEth, 30)
      const time = Number(next.id)

      return { ...prev, time, value, glpPrice }
    }

    return prev
  }

  const historicPortfolio = replayLatest(multicast(combineArray((assetMap, staked, { uniswapPrices, glpStats }, earnings) => {
    const parsedGlpStats = glpStats.filter(a => a.id !== 'total').sort((a, b) => getTime(a) - getTime(b))
    const source = [...uniswapPrices, ...parsedGlpStats, ...staked.stakeGlps, ...staked.stakeGmxes]
      .sort((a, b) => getTime(a) - getTime(b))
      // .slice(300)
    
    
    const gmxPrice = BigInt(uniswapPrices[uniswapPrices.length - 1].value)
    const glpPrice = BigInt(parsedGlpStats[0].glpSupply)

    const seed: ITreasuryTick = {
      time: getTime(source[0]),
      gmxPrice,
      glpPrice: glpPrice ? glpPrice / BigInt(glpStats[0].aumInUsdg) : 0n,
      value: 0,
      cumulativeReward: 0,
      balanceEth: assetMap.eth.balanceUsd,
      balanceGlp: 0n,
      balanceGmx: 0n,
      amountGlp: 0n,
      amountGmx: 0n,
    }


    const filledGap = fillIntervalGap({
      seed, source, getTime,
      interval: Math.floor(intervalInMsMap.MIN60 / 1000),
      fillMap: fillRewards,
      // squashMap: (prev, next) => prev
    })
    const oldestTick = filledGap[filledGap.length - 1]


    const endForecast = {
      ...oldestTick,
      time: Math.floor((Date.now() + intervalInMsMap.MONTH * 12) / 1000)
    }

    const apr = formatFixed(earnings.totalAprPercentage, 2)
    const perc = ((apr / 365) / 12) / 100

    const filledForecast = fillIntervalGap({
      seed: oldestTick, source: [endForecast],
      getTime: (x) => x.time, 
      interval: Math.floor(intervalInMsMap.MIN60 / 1000),
      fillMap: (prev, next) => {
        return { ...prev, value: prev.value + prev.value * perc }
      },
    })


    return { filledGap, staked, uniswapPrices, glpStats, filledForecast }
  }, accountTokenBalances, stakingEvents, gmxPriceHistoryquery, stakingRewardsState)))


  const hasSeriesFn = (cross: MouseEventParams): boolean => {
    const mode = !!cross?.seriesPrices?.size
    return mode
  }
  const pnlCrosshairMoveMode = skipRepeats(map(hasSeriesFn, pnlCrosshairMove))
  const pnlCrossHairChange = skipRepeats(map(change => {
    const newLocal = change.seriesPrices.entries()
    const newLocal_1 = newLocal.next()
    const value = newLocal_1?.value
    return value ? value[1] : null
  }, pnlCrosshairMove))
  const crosshairWithInitial = startWith(false, pnlCrosshairMoveMode)

  const lastTickFromHistory = <T extends {time: number}>(historicPnl: T[]) => map((cross: MouseEventParams) => {
    return historicPnl.find(tick => cross.time === tick.time)!
  })
  
  const chartPnLCounter = multicast(switchLatest(combineArray((mode, graph) => {
    if (mode) {
      return map(change => change, pnlCrossHairChange)
    } else {
      return now(graph.filledGap[graph.filledGap.length -1].value)
    }
  }, crosshairWithInitial, historicPortfolio)))


  const ethAsset = map(x => x.eth, accountTokenBalances)
  const gmxAsset = map(x => x.gmx, accountTokenBalances)
  const glpAsset = map(x => x.glp, accountTokenBalances)

  const $metricEntry = (label: string, value: string) => $row(style({ fontSize: '.75em', alignItems: 'center' }))(
    $text(style({ color: pallete.foreground, flex: 1 }))(label),
    $text(style({ fontWeight: 'bold' }))(value),
  )

  return [
    $column(layoutSheet.spacingBig)(

      $column(style({ placeContent:'center', alignItems: 'center' }))(
        $text(style({ fontSize: '2em', fontWeight: 'bold' }))('Treasury'),
        $text(style({ fontSize: '.75em', color: pallete.foreground }))('WORK IN PROGRESS')
      ),

      $card(style({ padding: 0, flex: 'none', overflow: 'hidden', height: '300px', position: 'relative' }))(
        $row(style({ position: 'absolute', zIndex: 10, left: 0, right: 0, pointerEvents: 'none', padding: '26px' }))(
          $column(style({ flex: 1, alignItems: 'flex-start' }))(
            $row(style({ alignItems: 'baseline' }))(
              switchLatest(map(({ esGmxInStakedGmx, totalRewardsUsd   }) => {
                return $row(layoutSheet.spacing, style({ pointerEvents: 'all' }))(
                  $row(layoutSheet.spacingTiny, style({ alignItems: 'baseline' }))(
                    $text(style({ fontWeight: 'bold', fontSize: '1em' }))(`+${readableNumber(formatFixed(esGmxInStakedGmx, 18))}`),
                    $text(style({ fontSize: '.75em', color: pallete.foreground, fontWeight: 'bold' }))(`esGMX`),
                  )
                  // $text(`+${formatReadableUSD(totalRewardsUsd)}$`),
                )
              }, stakingRewardsState))
            ),
            $text(style({ color: pallete.foreground, fontSize: '.65em', textAlign: 'center' }))('Pending Rewards')
          ),
          $column(
            $row(style({ fontSize: '2em', alignItems: 'baseline' }))(
              $NumberTicker({
                textStyle: {
                  fontWeight: 'bold',
                  fontFamily: 'RelativeMono'
                },
                value$: map(Math.round, motion({ ...MOTION_NO_WOBBLE, precision: 15, stiffness: 210 }, 0, chartPnLCounter)),
                incrementColor: pallete.positive,
                decrementColor: pallete.negative
              }),
              $text(style({ fontSize: '.75em', color: pallete.foreground }))('$'),
            ),
            $text(style({ color: pallete.foreground, fontSize: '.75em', textAlign: 'center' }))('Total Holdings')
          ),
          $text(style({ flex: 1 }))('')
        ),
        switchLatest(
          combineArray((data) => {
            // const startDate = new Date(data[0].time * 1000)
            // const endDate = new Date(data[data.length - 1].time * 1000)
            

            const lastTick = data.filledGap[data.filledGap.length -1]

            return $Chart({
              initializeSeries: map((api) => {


                const seriesForecast = api.addLineSeries({
                  baseLineWidth: 1,
                  priceLineWidth: 1,
                  priceLineVisible: false,
                  lastValueVisible: false,
                  lineWidth: 2,
                  lastPriceAnimation: LastPriceAnimationMode.Disabled,
                  // autoscaleInfoProvider: () => {},
                  // title: 'Forecast',
                  lineStyle: LineStyle.LargeDashed,
                  color: pallete.foreground,
                })

                const series = api.addBaselineSeries({
                  baseLineWidth: 1,
                  // lineColor: colorAlpha(pallete.positive, .5),
                  priceLineWidth: 1,
                  // lineStyle: LineStyle.Dotted,
                  topFillColor1: pallete.positive,
                  topFillColor2: 'transparent',
                  bottomFillColor1: 'transparent',
                  bottomFillColor2: colorAlpha(pallete.primary, .3),
                  bottomLineColor: pallete.primary,
                  // topLineColor: pallete.positive,
                  baseValue: {
                    type: 'price',
                    // price: lastTick,
                    price: lastTick.value,
                  },
                  lineWidth: 2,
                  baseLineVisible: false,
                  lastValueVisible: false,
                  priceLineVisible: false,
                })

                const addGlps = data.staked.stakeGlps
                  .map((ip): SeriesMarker<Time> => {
                    return {
                      color: pallete.foreground,
                      position: "aboveBar",
                      shape: "arrowUp",
                      size: .15,
                      time: unixTimeTzOffset(ip.timestamp),
                      text:  'GLP +' + readableNumber(Number(formatFixed(BigInt(ip.amount), 18)))
                    }
                  })

                const addGmxs = data.staked.stakeGmxes
                  // .filter(staked => formatFixed(BigInt(staked.amount), 18) > 200)
                  .map((ip): SeriesMarker<Time> => {
                    return {
                      color: pallete.foreground,
                      position: "aboveBar",
                      shape: 'arrowUp',
                      size: .15,
                      time: unixTimeTzOffset(ip.timestamp),
                      text:  'GMX +' + readableNumber(Number(formatFixed(BigInt(ip.amount), 18)))
                    }
                  })



                const newLocal = data.filledForecast.filter(x => x.time > lastTick.time)

                // @ts-ignore
                seriesForecast.setData(newLocal)
                // @ts-ignore
                series.setData(data.filledGap)

                const from = data.filledGap[0].time as Time
                const to = (data.filledGap[data.filledGap.length -1].time + (intervalInMsMap.HR24 * 12 / 1000)) as Time
                api.timeScale().setVisibleRange({ from, to })
                // series.coordinateToPrice()


                setTimeout(() => {
                  series.setMarkers([...addGlps, ...addGmxs].sort((a, b) => Number(a.time) - Number(b.time)))
                }, 55)


                return series
              }),
              chartConfig: {
                localization: {
                  priceFormatter: (priceValue: BarPrice) => {
                    return  `$${readableNumber(priceValue)}`
                  }
                },
                layout: {
                  fontFamily: "RelativeMono",
                  backgroundColor: 'transparent',
                  textColor: pallete.foreground,
                  fontSize: 11
                },
                crosshair: {
                  mode: CrosshairMode.Magnet,
                  horzLine: {
                    // visible: false,
                    labelBackgroundColor: pallete.foreground,
                    labelVisible: false,
                    color: pallete.foreground,
                    width: 1,
                    style: LineStyle.SparseDotted,
                  },
                  vertLine: {
                    color: pallete.foreground,
                    labelBackgroundColor: pallete.foreground,
                    width: 1,
                    style: LineStyle.SparseDotted,
                  }
                },
                rightPriceScale: {
                  mode: PriceScaleMode.Normal,
                  autoScale: true,

                  visible: true,
                  scaleMargins: {
                    top: 0.35,
                    bottom: 0,
                  }
                },
                // overlayPriceScales: {
                //   invertScale: true
                // },
                // handleScale: false,
                // handleScroll: false,
                timeScale: {
                  // rightOffset: 110,
                  secondsVisible: false,
                  timeVisible: true,
                  rightOffset: 0,
                  // fixLeftEdge: true,
                  // fixRightEdge: true,
                  // visible: false,
                  rightBarStaysOnScroll: true,
                },
              },
              containerOp: style({  
                position: 'absolute', left: 0, top: 0, right: 0, bottom: 0
              }),
            })({
              crosshairMove: pnlCrosshairMoveTether(
                skipRepeatsWith((a, b) => a.point?.x === b.point?.x),
                multicast
              )
            })
          }, historicPortfolio)
        )
      ),

      $column(layoutSheet.spacing, style({}))(
        $column(layoutSheet.spacing, style({ flex: 2 }))(
          screenUtils.isDesktopScreen
            ? $row(style({ color: pallete.foreground, fontSize: '.75em' }))(
              $text(style({ flex: 1 }))('Holdings'),
              $text(style({ flex: 1 }))('Distribution'),
              $text('Avg Entry History'),
            ) : empty(),
          $column(layoutSheet.spacing)(
            $AssetDetails({
              label: 'GMX',
              symbol: 'GMX',
              asset: gmxAsset,
              priceChart: gmxPriceInterval,
              $distribution: switchLatest(map(({ totalGmxRewardsUsd, gmxAprTotalPercentage, bonusGmxTrackerRewards, bnGmxInFeeGmx, bonusGmxInFeeGmx, gmxAprForEthPercentage, gmxAprForEsGmxPercentage }) => {

                const multiplierPointsAmount = bonusGmxTrackerRewards + bnGmxInFeeGmx
                const boostBasisPoints = formatFixed(bnGmxInFeeGmx * BASIS_POINTS_DIVISOR / bonusGmxInFeeGmx, 2)
          
                return $column(layoutSheet.spacingTiny, style({ flex: 1 }))(
                  $metricEntry(`esGMX`, `${formatFixed(gmxAprForEsGmxPercentage, 2)}%`),
                  $metricEntry(`ETH`, `${formatFixed(gmxAprForEthPercentage, 2)}%`),
                  $metricEntry(`Age Boost`, `${boostBasisPoints}%`),
                  $metricEntry(`Multiplier Points`, `${readableNumber(formatFixed(bnGmxInFeeGmx, 18))}`),
                )
              }, stakingRewardsState)),
              $iconPath: $tokenIconMap[ARBITRUM_ADDRESS.GMX],
            })({}),
            style({ backgroundColor: colorAlpha(pallete.foreground, .15) }, $seperator),
            $AssetDetails({
              label: 'GLP',
              symbol: 'GLP',
              asset: glpAsset,
              priceChart: glpPriceInterval,
              $distribution: switchLatest(map(({ glpAprForEsGmxPercentage, glpAprForEthPercentage,   }) => {

                return $column(layoutSheet.spacingTiny, style({ flex: 1 }))(
                  $metricEntry(`esGMX`, `${formatFixed(glpAprForEsGmxPercentage, 2)}%`),
                  $metricEntry(`ETH`, `${formatFixed(glpAprForEthPercentage, 2)}%`),
                // $metricEntry(`Multiplier Points`, `${readableNumber(formatFixed(bnGmxInFeeglp, 18))}`),
                )
              }, stakingRewardsState)),
              $iconPath: $tokenIconMap[ARBITRUM_ADDRESS.GLP],
            })({}),
          ),
        ),

      )
      
    )
  ]
})


function getTime(next: IUniswapSwap | IGlpStat | IStake): number {
  if (next.__typename === 'GlpStat') {
    return Number(next.id) || 0
  }
  return Number(next.timestamp)
}


function getGlpPrice(g: IGlpStat): bigint {
  const aum = BigInt(g.aumInUsdg)
  const glpSupply = BigInt(g.glpSupply)
  const glpPrice = aum * USD_PRECISION / glpSupply
  return glpPrice
}