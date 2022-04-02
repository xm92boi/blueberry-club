import { Behavior, combineArray, O, Op } from "@aelea/core"
import { $Node, $node, $text, attr, component, IBranch, nodeEvent, style } from "@aelea/dom"
import { Route } from '@aelea/router'
import { $column, $icon, $Popover, $row, layoutSheet, screenUtils, state } from '@aelea/ui-components'
import { pallete } from "@aelea/ui-components-theme"
import { formatReadableUSD, IClaim } from "@gambitdao/gmx-middleware"
import { IWalletLink } from "@gambitdao/wallet-link"
import {  constant, empty, map, now, switchLatest } from '@most/core'
import { Stream } from "@most/types"
import { IEthereumProvider } from "eip1193-provider"
import { WALLET } from "../logic/provider"
import { $caretDown } from "../elements/$icons"
import { $AccountPreview } from "./$AccountProfile"
import { $IntermediateConnect } from "./$ConnectAccount"
import { $ButtonSecondary } from "./form/$Button"
import { totalWalletHoldingsUsd } from "../logic/gbcTreasury"
import { $Dropdown, $defaultSelectContainer } from "./form/$Dropdown"
import { $bagOfCoinsCircle, $fileCheckCircle } from "../common/$icons"
import { $anchor, $discord, $instagram, $Link, $moreDots, $twitter } from "@gambitdao/ui-components"
import { $seperator2 } from "../pages/common"
import { connectManager } from "../logic/contract/manager"

export const $socialMediaLinks = $row(layoutSheet.spacingBig)(
  $anchor(layoutSheet.displayFlex, attr({ target: '_blank' }), style({ padding: '0 4px', border: `2px solid ${pallete.middleground}`, borderRadius: '50%', alignItems: 'center', placeContent: 'center', height: '42px', width: '42px' }), attr({ href: 'https://discord.com/invite/7ZMmeU3z9j' }))(
    $icon({ $content: $discord, width: '22px', viewBox: `0 0 32 32` })
  ),
  $anchor(layoutSheet.displayFlex, attr({ target: '_blank' }), style({ padding: '0 4px', border: `2px solid ${pallete.middleground}`, borderRadius: '50%', alignItems: 'center', placeContent: 'center', height: '42px', width: '42px' }), attr({ href: 'https://www.instagram.com/blueberryclub.eth' }))(
    $icon({ $content: $instagram, width: '18px', viewBox: `0 0 32 32` })
  ),
  $anchor(layoutSheet.displayFlex, attr({ target: '_blank' }), style({ padding: '0 4px', border: `2px solid ${pallete.middleground}`, borderRadius: '50%', alignItems: 'center', placeContent: 'center', height: '42px', width: '42px' }), attr({ href: 'https://twitter.com/GBlueberryClub' }))(
    $icon({ $content: $twitter, width: '21px', viewBox: `0 0 24 24` })
  )
)

interface MainMenu {
  parentRoute: Route
  containerOp?: Op<IBranch, IBranch>
  walletLink: IWalletLink
  claimMap: Stream<{[x: string]: IClaim}>
  walletStore: state.BrowserStore<WALLET, "walletStore">

  showAccount?: boolean
}

export const $MainMenu = ({ walletLink, parentRoute, containerOp = O(), walletStore, claimMap, showAccount = true }: MainMenu) => component((
  [routeChange, routeChangeTether]: Behavior<string, string>,
  [profileLinkClick, profileLinkClickTether]: Behavior<any, any>,
  [walletChange, walletChangeTether]: Behavior<any, IEthereumProvider | null>,
  [clickPopoverClaim, clickPopoverClaimTether]: Behavior<any, any>,

) => {

  const $treasury = $row(style({ alignItems: 'center' }))(
    $text(style({ marginRight: '8px' }))('Treasury: '),
    switchLatest(map(x => $text('$' + formatReadableUSD(x)), totalWalletHoldingsUsd)),
    $icon({ $content: $caretDown, width: '14px', svgOps: style({ marginTop: '3px', marginLeft: '5px' }), viewBox: '0 0 32 32' }),
  )

  const $govItem = (label: string, $iconPath: $Node, description: string) => $row(layoutSheet.spacing)(
    $icon({ $content: $iconPath, width: '36px', svgOps: style({ minWidth: '36px' }), viewBox: '0 0 32 32' }),
    $column(layoutSheet.spacingTiny)(
      $text(label),
      $text(style({ color: pallete.foreground, fontSize:'.75em' }))(description)
    )
  )

  


  return [
    $row(layoutSheet.spacingBig, style({ fontSize: '.9em', flex: 1, alignItems: 'center', placeContent: 'flex-end' }), containerOp)(

      $Dropdown({
        // disabled: accountChange,
        // $noneSelected: $text('Choose Amount'),
        $selection: map(amount => $treasury),
        select: {
          value: now(null),
          $container: $defaultSelectContainer(style({ minWidth:'300px' })),
          optionOp: map(option => option),
          options: [
            $Link({ $content: $govItem('Treasury', $bagOfCoinsCircle, 'GBC Community-Led Portfolio'), url: '/p/treasury', route: parentRoute })({
              click: routeChangeTether()
            }),
            $anchor(style({ textDecoration:'none' }), attr({ href: 'https://snapshot.org/#/gbc-nft.eth', target:'_blank' }))(
              $govItem('Governance', $fileCheckCircle, 'Treasury Governance, 1 GBC = 1 Voting Power')
            ),
          ],
        }
      })({}),
      
      $Link({ $content: $text('Lab'), url: '/p/lab', route: parentRoute.create({ fragment: 'feefwefwe' }) })({
        click: routeChangeTether()
      }),
      $Link({ $content: $text('Leaderboard(WIP)'), disabled: now(true), url: '/p/leaderboard', route: parentRoute.create({ fragment: 'feefwefwe' }) })({
        click: routeChangeTether()
      }),
      
      style({ alignSelf: 'stretch' }, $seperator2),


      screenUtils.isDesktopScreen ? $socialMediaLinks : empty(),

      $Popover({
        dismiss: profileLinkClick,
        $$popContent: combineArray((_) => {
          return $column(layoutSheet.spacingBig)(
            screenUtils.isMobileScreen ? $socialMediaLinks : empty(),
            $ButtonSecondary({
              $content: $text('Change Wallet')
            })({
              click: walletChangeTether(
                map(pe => {
                  pe.preventDefault()
                  pe.stopImmediatePropagation()
                }),
                // awaitPromises,
                constant(null)
              )
            })
          )
        }, clickPopoverClaim),
      })(
        $IntermediateConnect({
          walletStore,
          $display: $row(
            switchLatest(map((account) => {
              if (!account) {
                return empty()
              }

              return $row(style({ border: `2px solid ${pallete.middleground}`, borderRadius: '30px' }))(
                $AccountPreview({
                  address: account,
                })({ profileClick: O(profileLinkClickTether(), routeChangeTether()) }),
                style({ marginLeft: '6px', backgroundColor: pallete.middleground, width: '2px' }, $seperator2),
                $icon({
                  svgOps: O(
                    clickPopoverClaimTether(nodeEvent('click')),
                    style({
                      padding: '6px',
                      cursor: 'pointer',
                      alignSelf: 'center',
                      marginRight: '6px',
                      transform: 'rotate(90deg)',
                    })
                  ),
                  width: '32px',
                  $content: $moreDots,
                  viewBox: '0 0 32 32'
                }),
              )
            }, walletLink.account))
          ),
          walletLink
        })({
          walletChange: walletChangeTether()
        }),
      )({
        // overlayClick: clickPopoverClaimTether()
      }),


     
    ),


    { routeChange, walletChange }
  ]
})


