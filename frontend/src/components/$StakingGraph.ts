import { Behavior, replayLatest, combineArray, combineObject } from "@aelea/core"
import { $text, component, motion, MOTION_NO_WOBBLE, style } from "@aelea/dom"
import { $column, $NumberTicker, $row, layoutSheet } from "@aelea/ui-components"
import { pallete } from "@aelea/ui-components-theme"
import { intervalInMsMap, readableNumber, formatFixed, ITimerange, formatReadableUSD } from "@gambitdao/gmx-middleware"
import { IWalletLink } from "@gambitdao/wallet-link"
import { map, multicast, now, skipRepeats,  skipRepeatsWith, startWith, switchLatest } from "@most/core"
import { Stream } from "@most/types"
import { LastPriceAnimationMode, LineStyle, Time, BarPrice, CrosshairMode, PriceScaleMode, MouseEventParams, SeriesMarker } from "lightweight-charts-baseline"
import { $card } from "../elements/$common"
import { intervalListFillOrderMap } from "../logic/common"
import {  IRewardsStream } from "../logic/contract"
import { IPricefeed, IPriceFeedMap, IStakingClaim } from "../logic/query"
import { IAsset, IYieldInterval } from "../types"
import { $Chart } from "./chart/$Chart"

export interface IValueInterval extends IAsset {
  price: IPricefeed
  time: number
}


export interface ITreasuryChart<T> extends Partial<ITimerange> {
  walletLink: IWalletLink
  graphInterval: number
  priceFeedHistoryMap: Stream<IPriceFeedMap>

  stakingYield: Stream<IStakingClaim<any>[]>
  valueSource: {[p in keyof T]: Stream<IValueInterval[]>}

  arbitrumStakingRewards: IRewardsStream
  avalancheStakingRewards: IRewardsStream
}



export const $StakingGraph = <T>(config: ITreasuryChart<T>)  => component((
  [pnlCrosshairMove, pnlCrosshairMoveTether]: Behavior<MouseEventParams, MouseEventParams>,
) => {


  const sources = combineObject(config.valueSource as {[k: string]: Stream<IValueInterval[]>})
  const historicPortfolio = replayLatest(multicast(combineArray((arbitrumStaking, avalancheStaking, revenueSourceList) => {

    const source = Object.values(revenueSourceList).flat().sort((a, b) => a.time - b.time)
    const seed: { time: number, value: number  } = {
      value: 0,
      time: source[0].time
    }

    const accumulatedAssetMap: {[k: string]: bigint} = {}


    const filledGap = intervalListFillOrderMap({
      seed,
      source,
      getTime: x => x.time,
      interval: config.graphInterval,
      fillMap: (prev, next) => {
        const feedAddress = next.price.feed
        accumulatedAssetMap[feedAddress] = next.balanceUsd

        const total = Object.values(accumulatedAssetMap).reduce((s, n) => s + n, 0n)
        const value = formatFixed(total, 30)

        return {
          value
        }
      },
    })

    const oldestTick = filledGap[filledGap.length - 1]

    const yearInMs = intervalInMsMap.MONTH * 12
    const endForecast = {
      ...oldestTick,
      time: Math.floor((Date.now() + yearInMs) / 1000)
    }

    const apr = formatFixed(arbitrumStaking.totalAprPercentage, 2)
    const perc = (apr / 100) / (yearInMs / config.graphInterval)


    const filledForecast = intervalListFillOrderMap({
      seed: oldestTick,
      source: [oldestTick, endForecast],
      getTime: (x) => x.time, 
      interval: config.graphInterval,
      fillMap (prev) {
        return { ...prev, value: prev.value + prev.value * perc }
      },
      fillGapMap(prev) {
        return { ...prev, value: prev.value + prev.value * perc }
      }
    })


    return {
      filledForecast, arbitrumStaking, avalancheStaking, revenueSourceList,
      filledGap: filledGap.map(x => ({ time: x.time, value: x.value }))
    }
  }, config.arbitrumStakingRewards, config.avalancheStakingRewards, sources)))


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


  
  const chartPnLCounter = multicast(switchLatest(combineArray((mode, graph) => {
    if (mode) {
      return map(change => change, pnlCrossHairChange)
    } else {
      return now(graph.filledGap[graph.filledGap.length -1].value)
    }
  }, crosshairWithInitial, historicPortfolio)))

  return [
    $card(style({ padding: 0, width: '100%', flex: 'none', overflow: 'hidden', height: '300px', position: 'relative' }))(
      $row(style({ position: 'absolute', alignItems: 'center', zIndex: 10, left: 0, right: 0, pointerEvents: 'none', padding: '8px 26px' }))(
        $row(layoutSheet.spacing, style({ flex: 1, alignItems: 'flex-start' }))(
          switchLatest(map(({ esGmxInStakedGmx }) => {
            
            return $column(layoutSheet.spacingTiny)(
              $text(style({ color: pallete.foreground, fontSize: '.65em', textAlign: 'center' }))('Compounding Rewards'),
              $row(layoutSheet.spacing)(
                $row(layoutSheet.spacing, style({ pointerEvents: 'all' }))(
                  $row(layoutSheet.spacingTiny, style({ alignItems: 'baseline' }))(
                    $text(style({ fontWeight: 'bold', fontSize: '1em' }))(`${readableNumber(formatFixed(esGmxInStakedGmx, 18))}`),
                    $text(style({ fontSize: '.75em', color: pallete.foreground, fontWeight: 'bold' }))(`esGMX`),
                  ),
                ),
              ),
            )
          }, config.arbitrumStakingRewards))
        ),
        $column(
          $text(style({ color: pallete.foreground, fontSize: '.65em', textAlign: 'center' }))('Yield Hodlings'),
          $row(style({ fontSize: '2em', alignItems: 'baseline' }))(
            $text(style({ fontSize: '.45em', color: pallete.foreground, margin: '5px' }))('$'),
            $NumberTicker({
              textStyle: {
                fontWeight: 'bold',
                fontFamily: 'RelativeMono'
              },
              value$: map(Math.round, motion({ ...MOTION_NO_WOBBLE, precision: 15, stiffness: 210 }, 0, chartPnLCounter)),
              incrementColor: pallete.positive,
              decrementColor: pallete.negative
            }),
          ),
        ),
        $row(layoutSheet.spacing, style({ flex: 1, placeContent: 'flex-end' }))(
          switchLatest(combineArray((arbiStaking, avaxStaking) => {
            
            return $column(layoutSheet.spacingTiny)(
              $text(style({ color: pallete.foreground, fontSize: '.65em', textAlign: 'center' }))('Pending Rewards'),
              $row(layoutSheet.spacing)(
                $row(layoutSheet.spacing, style({ pointerEvents: 'all' }))(
                  $row(layoutSheet.spacingTiny, style({ alignItems: 'baseline' }))(
                    $text(style({ fontWeight: 'bold', fontSize: '1em', color: pallete.positive }))(`+${readableNumber(formatFixed(arbiStaking.totalEsGmxRewards + avaxStaking.totalEsGmxRewards, 18))}`),
                    $text(style({ fontSize: '.75em', color: pallete.foreground, fontWeight: 'bold' }))(`esGMX`),
                  ),
                ),
                $row(layoutSheet.spacing, style({ pointerEvents: 'all' }))(
                  $row(layoutSheet.spacingTiny, style({ alignItems: 'baseline' }))(
                    $text(style({ fontWeight: 'bold', fontSize: '1em', color: pallete.positive }))(`+${readableNumber(formatFixed(arbiStaking.totalFeeRewards, 18))}`),
                    $text(style({ fontSize: '.75em', color: pallete.foreground, fontWeight: 'bold' }))(`ETH`),
                  ),
                ),
                $row(layoutSheet.spacing, style({ pointerEvents: 'all' }))(
                  $row(layoutSheet.spacingTiny, style({ alignItems: 'baseline' }))(
                    $text(style({ fontWeight: 'bold', fontSize: '1em', color: pallete.positive }))(`+${readableNumber(formatFixed(avaxStaking.totalFeeRewards, 18))}`),
                    $text(style({ fontSize: '.75em', color: pallete.foreground, fontWeight: 'bold' }))(`AVAX`),
                  ),
                ),
              ),
            )
          }, config.arbitrumStakingRewards, config.avalancheStakingRewards))
        )
      ),
      switchLatest(
        combineArray(({ filledGap, revenueSourceList, filledForecast }, yieldList) => {
          // const startDate = new Date(data[0].time * 1000)
          // const endDate = new Date(data[data.length - 1].time * 1000)
            

          return $Chart({
            initializeSeries: map((api) => {
              const lastTick = filledGap[filledGap.length - 1]


              const seriesForecast = api.addAreaSeries({
                baseLineWidth: 1,
                priceLineWidth: 1,
                priceLineVisible: false,
                lastValueVisible: false,
                lineWidth: 2,
                topColor: pallete.foreground,
                bottomColor: 'transparent',
                lastPriceAnimation: LastPriceAnimationMode.Disabled,
                // autoscaleInfoProvider: () => {},
                // title: 'Forecast',
                lineStyle: LineStyle.LargeDashed,
                lineColor: pallete.foreground,
              })

              seriesForecast.priceScale().applyOptions({
                scaleMargins: {
                  top: 0.41,
                  bottom: 0
                }
              })



              const glpSeries = api.addAreaSeries({
                lineWidth: 2,
                lineColor: pallete.primary,
                topColor: pallete.primary,
                bottomColor: 'transparent',
                baseLineVisible: false,
                priceLineVisible: false
              })


              const markerInterval = Math.floor(intervalInMsMap.DAY7 / 1000)


              if (yieldList.length) {
                const sortedMarkers = [...yieldList].sort((a, b) => a.timestamp - b.timestamp)

                const markers = intervalListFillOrderMap({
                  seed: {
                    time: sortedMarkers[0].timestamp,
                    value: 0n
                  },
                  source: sortedMarkers,
                  getTime: x => x.timestamp,
                  interval: markerInterval,
                  fillMap: (prev, obj) => {
                    return {
                      value: obj.amountUsd
                    }
                  },
                  fillGapMap: (prev, next) => ({ value: 0n }),
                  squashMap: (prev, next) => {
                    return {
                      value: prev.value + next.amountUsd
                    }
                  }
                }).filter(x => x.value).map((tick): SeriesMarker<any> => {
                  const rewardUsd = formatReadableUSD(tick.value)
                  const esGmxMsg = `+$${rewardUsd}`

                  return {
                    color: pallete.foreground,
                    position: "aboveBar",
                    shape: "circle",
                    size: 1,
                    time: tick.time + markerInterval,
                    text: `${esGmxMsg}`
                  }
                })

                setTimeout(() => {
                  glpSeries.setMarkers(markers)
                }, 135)

              }



              const forecastData = filledForecast.filter(x => x.time > lastTick.time)

              // @ts-ignore
              seriesForecast.setData(forecastData)
              // @ts-ignore
              glpSeries.setData(filledGap)

              const from = filledGap[0].time as Time
              const to = (filledGap[filledGap.length - 1].time + markerInterval) as Time
              // series.coordinateToPrice()
              setTimeout(() => {
                api.timeScale().setVisibleRange({ from, to })
              }, 35)


              return glpSeries
            }),
            chartConfig: {
              localization: {
                priceFormatter: (priceValue: BarPrice) => {
                  return `$${readableNumber(priceValue)}`
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

                visible: false,
                scaleMargins: {
                  top: 0.45,
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
                fixLeftEdge: true,
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
            
        }, historicPortfolio, config.stakingYield)
      )
    ),
    
    { pnlCrosshairMove }
  ]
})

