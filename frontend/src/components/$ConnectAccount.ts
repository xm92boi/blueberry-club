import { Behavior, combineArray, O, Op } from "@aelea/core"
import { $element, $Node, $text, attr, component, INode, style } from "@aelea/dom"
import { $column, $icon, $Popover, $row, layoutSheet, state } from "@aelea/ui-components"
import { pallete } from "@aelea/ui-components-theme"
import { awaitPromises, constant, empty, fromPromise, map, multicast, skipRepeats, snapshot, switchLatest } from "@most/core"
import { IEthereumProvider } from "eip1193-provider"
import { IWalletLink, attemptToSwitchNetwork } from "@gambitdao/wallet-link"
import { $walletConnectLogo } from "../common/$icons"
import * as wallet from "../logic/provider"
import { $ButtonPrimary, $ButtonSecondary } from "./form/$Button"
import { $caretDown } from "../elements/$icons"
import { USE_CHAIN } from "@gambitdao/gbc-middleware"
import { WALLET } from "../logic/provider"



export interface IIntermediateDisplay {
  $display: $Node
  walletLink: IWalletLink
  walletStore: state.BrowserStore<WALLET, "walletStore">

  containerOp?: Op<INode, INode>
}

export const $IntermediateConnect = (config: IIntermediateDisplay) => component((
  [connectPopover, connectPopoverTether]: Behavior<any, any>,
  [switchNetwork, switchNetworkTether]: Behavior<PointerEvent, Promise<any>>,
  [walletChange, walletChangeTether]: Behavior<PointerEvent, IEthereumProvider | null>,
) => {

  const noAccount = skipRepeats(config.walletLink.account)

  return [
    $row(config.containerOp || O())(
      switchLatest(combineArray((metamask, walletProvider, account) => {

        // no wallet connected, show connection flow
        if (!account || walletProvider === null) {
          const $walletConnectBtn = $ButtonSecondary({
            $content: $row(layoutSheet.spacing, style({ alignItems: 'center' }))(
              $row(style({ margin: '1px', backgroundColor: '#3B99FC', padding: '2px', borderRadius: '6px' }))(
                $icon({
                  viewBox: '0 0 32 32',
                  width: '18px',
                  fill: 'white',
                  $content: $walletConnectLogo,
                })
              ),
              $text('Wallet-Connect'),
            ), buttonOp: style({})
          })({
            click: walletChangeTether(
              map(async () => {
                await wallet.walletConnect.request({ method: 'eth_requestAccounts' })
                return wallet.walletConnect
              }),
              awaitPromises,
              src => config.walletStore.store(src, constant(WALLET.walletConnect)),
            )
          })

          const $connectButtonOptions = metamask
            ? $column(layoutSheet.spacing)(
              $ButtonSecondary({
                $content: $row(layoutSheet.spacing, style({ alignItems: 'center' }))(
                  $element('img')(attr({ src: '/assets/metamask-fox.svg' }), style({ width: '24px' }))(),
                  $text('Connect Metamask')
                ), buttonOp: style({})
              })({
                click: walletChangeTether(
                  map(async () => {
                    const metamaskProivder = await wallet.metamaskQuery

                    if (metamaskProivder) {
                      await metamaskProivder.request({ method: 'eth_requestAccounts' })

                      return metamaskProivder
                    }

                    throw new Error('Could not find metmask')
                  }),
                  awaitPromises,
                  src => config.walletStore.store(src, constant(WALLET.metamask)),
                ),
              }),
              $walletConnectBtn
            )
            : $walletConnectBtn

          return $Popover({
            $$popContent: constant($connectButtonOptions, connectPopover)
          })(
            $ButtonPrimary({
              $content: $row(layoutSheet.spacingSmall, style({ alignItems: 'center' }))(
                $text('Connect Wallet'),
                $icon({ $content: $caretDown, width: '13px', fill: pallete.background, svgOps: style({ marginTop: '2px' }), viewBox: '0 0 7.84 3.81' }),
              ), buttonOp: style({})
            })({
              click: connectPopoverTether(),
            })
          )({})
    
        }

        return $column(
          switchLatest(map((chain) => {
            if (chain !== USE_CHAIN) {
              return $ButtonPrimary({
                $content: $text('Switch to Arbitrum Network'),
              })({
                click: switchNetworkTether(
                  snapshot(async wallet => {
                    return wallet ? attemptToSwitchNetwork(wallet, USE_CHAIN).catch(error => {
                      alert(error.message)
                      console.error(error)
                      return error
                    }) : null
                  }, config.walletLink.wallet),
                )
              })
            }
                
            return config.$display
          }, config.walletLink.network))
        )
      }, fromPromise(wallet.metamaskQuery), config.walletLink.provider, noAccount)),
      
      switchLatest(map(empty, switchNetwork))
    ),

    {
      walletChange: multicast(walletChange)
    }
  ]
})



