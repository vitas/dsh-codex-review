/**
 * Browser half of dsh-codex-review: registers the reviewer's configuration card
 * on whichever Plugins surface the running client offers, without a version check.
 *
 * - DSH 0.1.7+ moved Plugins to a sidebar page and keys row configuration by
 *   `<package name>#<row id>` on the `plugins.row.config` slot; the package-wide
 *   `plugins.bundle.config` slot is what the shipped bundles use, and is the one
 *   that shows the form the moment the plugin page opens, so it is registered
 *   first and the row slot kept as the fallback.
 * - DSH 0.1.5 keeps the Plugins settings tab and the `settings.plugin.item` slot,
 *   bound through `ctx.settingsScope.bind({ namespace })`.
 *
 * Each surface is registered through its own `ctx.inject`, so a fiber fires only
 * where its service exists. Only framework services (`slots`, `configForms`,
 * `settingsScope`) and this package's own components are used, so a future
 * platform that drops the settings UI simply never fires the fiber.
 *
 * The Subagent allowlist is read from another plugin's namespace purely to widen
 * the model suggestions; if that plugin is absent the scope reports nothing and
 * the card falls back to its own list.
 *
 * @module dsh-codex-review/src/client
 */
import * as React from 'react'
import { ReviewSettingsCard } from './SettingsCard.js'
import { PACKAGE_NAME, ROW_CONFIG_KEY, SETTINGS_NAMESPACE as NS } from '../../config.mjs'

/** The Subagent model-selection policy, read read-only to suggest models. */
const SUBAGENT_ALLOWLIST_NAMESPACE = 'subagent-model-selection-settings'

export const name = 'dsh-codex-review'
export const inject = ['slots']

/**
 * DSH 0.1.7+ — the plugin manager page asks for this row's configuration.
 *
 * @param ctx - the browser plugin context.
 */
function registerRowConfig(ctx: any): void {
  ctx.inject(['configForms'], (c: any) => {
    const card = (props: { view?: string }) =>
      props?.view === 'summary'
        ? null
        : React.createElement(ReviewSettingsCard, {
          scope: c.configForms.get(NS),
          allowlist: c.configForms.get(SUBAGENT_ALLOWLIST_NAMESPACE),
          // The composition's own model catalog: which routes exist and what each
          // serves. Read defensively — this card is a convenience, and a client
          // without the session service must still render its static list.
          catalog: () => c.remote?.session?.modelCatalog?.(),
          heading: false,
        })

    const register = () => {
      try {
        c.slots.inject('plugins.bundle.config', () =>
          c.slots.register({ name: 'plugins.bundle.config', key: PACKAGE_NAME }, card))
      } catch {
        // A client that predates the package slot still gets the row form below.
      }
      try {
        c.slots.inject('plugins.row.config', () =>
          c.slots.register({ name: 'plugins.row.config', key: ROW_CONFIG_KEY }, card))
      } catch {
        // A slot anomaly must never break the Plugins page itself.
      }
    }

    try {
      // `whileServed` keeps the registration alive only while the Host actually
      // serves this namespace, so a deployment that never composed the row shows
      // no trace of the card.
      if (typeof c.configForms?.whileServed === 'function') {
        c.effect(() => c.configForms.whileServed([NS], register), 'codex-review: settings page')
      } else {
        register()
      }
    } catch {
      // A slot anomaly must never break the Plugins page itself.
    }
  })
}

/**
 * DSH 0.1.5 — the Plugins settings tab, keyed by the namespace the host
 * registered imperatively with `ctx.settings.installSection`.
 *
 * @param ctx - the browser plugin context.
 */
function registerSettingsItem(ctx: any): void {
  ctx.inject(['settingsScope'], (c: any) => {
    try {
      const scope = c.settingsScope.bind({ namespace: NS })
      c.slots.inject('settings.plugin.item', () =>
        c.slots.register({ name: 'settings.plugin.item', key: NS, id: 'codex-review', order: 30 }, () =>
          React.createElement(ReviewSettingsCard, { scope }),
        ),
      )
    } catch {
      // Binding anomalies must never break the settings page itself.
    }
  })
}

/**
 * Client entry point.
 *
 * Deliberately NO `export default`: the client module system resolves the plugin
 * from the module namespace, and a default export makes it treat the bare `apply`
 * function as the plugin — which loses `inject`, so the first `ctx.slots` read
 * fails the fiber.
 */
export function apply(ctx: any) {
  registerRowConfig(ctx)
  registerSettingsItem(ctx)
}
