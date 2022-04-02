import { Behavior, fromCallback, replayLatest } from "@aelea/core"
import { $element, $node, component, eventElementTarget, style } from "@aelea/dom"
import * as router from '@aelea/router'
import { $RouterAnchor } from '@aelea/router'
import { $column, $icon, $row, designSheet, layoutSheet, screenUtils, state } from '@aelea/ui-components'
import { groupByMap, intervalInMsMap } from '@gambitdao/gmx-middleware'
import { initWalletLink } from "@gambitdao/wallet-link"
import {
  awaitPromises, constant, map, merge, mergeArray, multicast, now,
  startWith, switchLatest, tap
} from '@most/core'
import { Stream } from "@most/types"
import { IEthereumProvider } from "eip1193-provider"
import { $logo } from '../common/$icons'
import { $MainMenu } from '../components/$MainMenu'
import { claimListQuery } from "../logic/claim"
import * as wallet from "../logic/provider"
import { WALLET } from "../logic/provider"
import { helloBackend } from '../logic/websocket'
import { IAccountStakingStore, ITreasuryStore } from "@gambitdao/gbc-middleware"
import { $BerryPage } from "./$Berry"
import { $Account } from "./$Profile"
import { $Treasury } from "./$Treasury"
import { $seperator2 } from "./common"
import { $LabLanding } from "./lab/$Landing"
import { fadeIn } from "../transitions/enter"
import { $Wardrobe } from "./lab/$Wardrobe"
import { $LabStore } from "./lab/$Store"
import { $LabItem } from "./lab/$Item"
import { $Home } from "./$Home"




const popStateEvent = eventElementTarget('popstate', window)
const initialLocation = now(document.location)
const requestRouteChange = merge(initialLocation, popStateEvent)
const locationChange = map((location) => {
  return location
}, requestRouteChange)


interface Website {
  baseRoute?: string
}



export default ({ baseRoute = '' }: Website) => component((
  [routeChanges, linkClickTether]: Behavior<any, string>,
  [walletChange, walletChangeTether]: Behavior<IEthereumProvider | null, IEthereumProvider | null>,
) => {

  const changes = merge(locationChange, multicast(routeChanges))
  const fragmentsChange = map(() => {
    const trailingSlash = /\/$/
    const relativeUrl = location.href.replace(trailingSlash, '').split(document.baseURI.replace(trailingSlash, ''))[1]
    const frags = relativeUrl.split('/')
    frags.splice(0, 1, baseRoute)
    return frags
  }, changes)


  const rootRoute = router.create({ fragment: baseRoute, title: 'GMX Blueberry Club', fragmentsChange })
  const pagesRoute = rootRoute.create({ fragment: 'p', title: '' })
  const treasuryRoute = pagesRoute.create({ fragment: 'treasury', title: 'Treasury' })
  const berryRoute = pagesRoute.create({ fragment: 'berry' }).create({ fragment: /\d+/, title: 'Berry' })
  const accountRoute = pagesRoute.create({ fragment: 'account', title: 'Berry Account' })
  const labRoute = pagesRoute.create({ fragment: 'lab', title: 'Blueberry Lab' })
  const wardrobeRoute = pagesRoute.create({ fragment: 'wardrobe', title: 'Wardrobe' })
  const storeRoute = pagesRoute.create({ fragment: 'lab-store', title: 'Store' })
  const itemRoute = pagesRoute.create({ fragment: 'item' }).create({ fragment: /\d+/, title: 'Lab Item' })


  const claimMap = replayLatest(
    map(list => groupByMap(list, item => item.account.toLowerCase()), claimListQuery())
  )


  const clientApi = helloBackend({

  })

  // localstorage
  const rootStore = state.createLocalStorageChain('ROOT')
  const walletStore = rootStore<WALLET, 'walletStore'>('walletStore', WALLET.none)
  const treasuryStore = rootStore<ITreasuryStore, 'treasuryStore'>('treasuryStore', { startedStakingGlpTimestamp: 1639431367, startedStakingGmxTimestamp: 1639432924 - intervalInMsMap.MIN5 })
  const accountStakingStore = rootStore<IAccountStakingStore, 'treasuryStore'>('treasuryStore', { })

  const chosenWalletName = now(walletStore.state)
  const defaultWalletProvider: Stream<IEthereumProvider | null> =  multicast(switchLatest(awaitPromises(map(async name => {
    const isWC = name === WALLET.walletConnect
    const provider = isWC ? wallet.walletConnect : await wallet.metamaskQuery

    if (name && provider) {
      const [mainAccount]: string[] = await provider.request({ method: 'eth_accounts' }) as any

      if (mainAccount) {
        if (isWC) {
          const connector = wallet.walletConnect.connector
          const wcDisconnected = constant(null, fromCallback(cb => connector.on('disconnect', cb)))

          return startWith(provider, wcDisconnected)
        }

        return now(provider)
      }
    }

    return now(null)
  }, chosenWalletName))))



  const walletLink = initWalletLink(
    replayLatest(multicast(mergeArray([defaultWalletProvider, tap(console.log, walletChange)])))
  )




  return [

    $node(designSheet.main, style({ alignItems: 'center', overflowX: 'hidden',  placeContent: 'center', padding: screenUtils.isMobileScreen ? '0 15px': '' }))(
      router.match(rootRoute)(
        $Home({
          walletLink,
          parentRoute: pagesRoute,
          treasuryStore,
          claimMap,
          walletStore
        })({
          routeChanges: linkClickTether(),
          walletChange: walletChangeTether()
        })
      ),
      
      router.contains(pagesRoute)(
        $column(layoutSheet.spacingBig, style({ maxWidth: '1256px', width: '100%', margin: '0 auto', paddingBottom: '45px' }))(
          $row(style({ width: '100%', padding: '30px 0 0', zIndex: 1000, borderRadius: '12px' }))(
            $row(layoutSheet.spacingBig, style({ alignItems: 'center', flex: 1 }))(
              $RouterAnchor({ url: '/', route: rootRoute, anchorOp: style({ display: 'flex' }), $anchor: $element('a')($icon({ $content: $logo, width: '55px', viewBox: '0 0 32 32' })) })({
                click: linkClickTether()
              }),
              $MainMenu({ walletLink, claimMap, parentRoute: pagesRoute, walletStore })({
                routeChange: linkClickTether(),
                walletChange: walletChangeTether()
              }),
            ),
          ),

          style({ margin: '0 -100vw' }, $seperator2),

          $node(),

          $column(layoutSheet.spacingBig, style({ maxWidth: '1160px', width: '100%', margin: '0 auto', paddingBottom: '45px' }))(
            router.match(berryRoute)(
              $BerryPage({ walletLink, parentRoute: pagesRoute })({})
            ),
            router.match(labRoute)(
              fadeIn($LabLanding({ walletLink, parentRoute: labRoute, walletStore })({
                changeRoute: linkClickTether(), walletChange: walletChangeTether()
              }))
            ),
            router.contains(storeRoute)(
              fadeIn($LabStore({ walletLink, parentRoute: storeRoute })({
                changeRoute: linkClickTether()
              }))
            ),
            router.match(itemRoute)(
              $LabItem({ walletLink, walletStore, parentRoute: itemRoute })({
                changeRoute: linkClickTether()
              })
            ),
            router.match(wardrobeRoute)(
              fadeIn($Wardrobe({ wallet: walletLink, parentRoute: wardrobeRoute })({}))
            ),
            router.match(accountRoute)(
              $Account({ walletLink, parentRoute: pagesRoute, accountStakingStore })({})
            ),
            router.match(treasuryRoute)(
              $Treasury({ walletLink, parentRoute: treasuryRoute, treasuryStore })({})
            ),
          )
        )
      ),
    )
  ]
})


