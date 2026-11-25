import { useState } from "react";

import { AD_REWARDS, MAX_SLOTS, PRODUCTS } from "@shared/balance";

import { sfx } from "../../audio/sfx";
import { isRewardedAvailable, watchRewardedAd } from "../../bloxity/services";
import { actions } from "../../net/actions";
import { useGame } from "../../store/game";
import Icon from "../Icon";
import StrokeText from "../StrokeText";
import { buyNextSlot, nextSlotCost } from "../hud/slots";
import { ChunkyButton, CoinAmount, SectionLabel } from "../hud/parts";
import { GRADIENTS, u } from "../hud/style";
import { NitroShop, PaintShop } from "./CosmeticsShop";
import Panel, { Well } from "./Panel";

const TABS = [
  { id: "offers", label: "OFFERS", icon: "store" },
  { id: "paint", label: "PAINT", icon: "car" },
  { id: "nitro", label: "NITRO", icon: "nitro" },
];

/** Rewarded-ad placement that grants a free spin (shared/balance.js AD_REWARDS). */
const FREE_SPIN_PLACEMENT =
  Object.keys(AD_REWARDS || {}).find((k) => AD_REWARDS[k]?.grant?.spin) ||
  "free-spin";

const productList = () =>
  Array.isArray(PRODUCTS)
    ? PRODUCTS
    : Object.entries(PRODUCTS || {}).map(([id, p]) => ({ id, ...p }));

/** A price in Sky Pearls: the pearl icon and the count (red when you can't pay). */
function PearlAmount({ amount, size = 28, afford = true }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: u(size * 0.15), fontSize: u(size), lineHeight: 1 }}
    >
      <Icon name="pearl" size={u(size * 1.25)} />
      <StrokeText
        stroke={u(size * 0.24)}
        gradient={afford ? GRADIENTS.pearl : GRADIENTS.red}
      >
        {amount}
      </StrokeText>
    </span>
  );
}

function ProductCard({ product, coins, pearls, slots }) {
  const withPearls = product.kind === "pearls";
  const price = Number(product.price ?? product.cost ?? 0);
  // The item slot has nothing to sell once every slot is open.
  const soldOut = product.id === "slot_pass" && slots >= MAX_SLOTS;
  const afford = !soldOut && (withPearls ? pearls >= price : coins >= price);
  const onBuy = () => {
    if (!afford) {
      sfx.error();
      useGame
        .getState()
        .showToast(
          withPearls ? "Not enough pearls" : "Not enough coins",
          "error",
          `${product.name} costs ${product.priceLabel || price}`,
        );
      return;
    }
    // Pearl purchases play their sound and fanfare when the server confirms them.
    if (!withPearls) sfx.buy();
    actions.purchase(product.id);
    // A spin product: watch it land on the Car Spin's reel.
    if (product.id.includes("spin")) {
      useGame.getState().setSpinning(true);
      useGame.getState().openPanel("spin");
    }
  };
  return (
    <Well
      className="pp-product flex flex-col items-center text-center"
      style={{ gap: u(8), paddingTop: u(20) }}
    >
      <span
        className="pp-halo flex items-center justify-center"
        style={{ width: u(112), height: u(112) }}
      >
        <Icon
          name={
            product.icon ||
            (product.coins
              ? "coin"
              : product.id.includes("spin")
                ? "spin"
                : product.id.includes("slot")
                  ? "lock"
                  : "store")
          }
          size={u(84)}
        />
      </span>
      <span style={{ fontSize: u(30) }}>
        <StrokeText stroke={u(7)}>{product.name || product.id}</StrokeText>
      </span>
      {product.coins > 0 && <CoinAmount amount={product.coins} size={28} />}
      {(product.blurb || product.description) && (
        <span
          className="pp-stroke"
          style={{
            fontSize: u(18),
            whiteSpace: "normal",
            lineHeight: 1.3,
            display: "block",
            opacity: 0.85,
          }}
        >
          {product.blurb || product.description}
        </span>
      )}
      <ChunkyButton
        onClick={onBuy}
        disabled={soldOut}
        gradient={afford ? GRADIENTS.greenButton : GRADIENTS.greyButton}
        radius={16}
        style={{
          height: u(70),
          padding: `0 ${u(22)}`,
          marginTop: "auto",
          minWidth: u(170),
        }}
      >
        {soldOut ? (
          <span style={{ fontSize: u(26) }}>
            <StrokeText stroke={u(6)}>ALL OPEN</StrokeText>
          </span>
        ) : withPearls ? (
          <PearlAmount amount={price} afford={afford} />
        ) : (
          <CoinAmount amount={price} size={28} afford={afford} />
        )}
      </ChunkyButton>
    </Well>
  );
}

/**
 * Store, in three tabs: OFFERS (item-slot upgrades, products from shared/balance.js
 * PRODUCTS - the Mega Spin for coins, coin packs and an item slot for Sky Pearls - and a
 * free spin for watching an ad where Boxity offers one), PAINT and NITRO (colours for
 * coins, CosmeticsShop.jsx).
 */
export function StorePanel() {
  const coins = useGame((s) => s.profile.coins || 0);
  const slots = useGame((s) => s.profile.slots || 1);
  const pearls = useGame((s) => s.profile.pearlBank || 0);
  const slotCost = nextSlotCost(slots);
  const products = productList();
  const adAvailable = isRewardedAvailable();
  const [tab, setTab] = useState("offers");

  return (
    <Panel title="STORE" icon="store" width={1160}>
      <div className="flex flex-col" style={{ gap: u(18) }}>
        <span
          className="pp-tabs flex self-start"
          style={{ gap: u(6), padding: u(6), borderRadius: u(20) }}
        >
          {TABS.map((t) => (
            <ChunkyButton
              key={t.id}
              onClick={() => setTab(t.id)}
              gradient={
                t.id === tab ? GRADIENTS.goldButton : GRADIENTS.navyButton
              }
              radius={14}
              className={t.id === tab ? "pp-tab-on" : ""}
              style={{ height: u(60), padding: `0 ${u(18)}`, gap: u(8) }}
            >
              <Icon name={t.icon} size={u(36)} />
              <span style={{ fontSize: u(24) }}>
                <StrokeText stroke={u(6)}>{t.label}</StrokeText>
              </span>
            </ChunkyButton>
          ))}
        </span>
        {tab === "paint" && (
          <>
            <SectionLabel style={{ marginBottom: 0 }}>
              PAINT · ANY CAR YOU DRIVE
            </SectionLabel>
            <PaintShop />
          </>
        )}
        {tab === "nitro" && (
          <>
            <SectionLabel style={{ marginBottom: 0 }}>
              NITRO FLAME COLOUR
            </SectionLabel>
            <NitroShop />
          </>
        )}
        {tab === "offers" && (
          <>
            <Well
              className="pp-feature flex flex-wrap items-center justify-between"
              style={{ gap: u(14) }}
            >
              <span className="flex items-center" style={{ gap: u(12) }}>
                <span
                  className="pp-halo flex shrink-0 items-center justify-center"
                  style={{ width: u(92), height: u(92) }}
                >
                  <Icon
                    name={slotCost == null ? "check" : "lock"}
                    size={u(66)}
                  />
                </span>
                <span className="flex flex-col">
                  <span style={{ fontSize: u(32) }}>
                    <StrokeText stroke={u(7)}>
                      {slotCost == null
                        ? "All item slots unlocked"
                        : `Item slot ${slots + 1}`}
                    </StrokeText>
                  </span>
                  <span
                    className="pp-stroke"
                    style={{
                      fontSize: u(18),
                      opacity: 0.85,
                      whiteSpace: "normal",
                      lineHeight: 1.3,
                      display: "block",
                    }}
                  >
                    Carry one more item from the item crates on the track.
                  </span>
                </span>
              </span>
              {slotCost != null && (
                <ChunkyButton
                  onClick={buyNextSlot}
                  ready={coins >= slotCost}
                  gradient={
                    coins >= slotCost
                      ? GRADIENTS.goldButton
                      : GRADIENTS.greyButton
                  }
                  radius={16}
                  style={{ height: u(74), padding: `0 ${u(26)}`, gap: u(10) }}
                >
                  <span style={{ fontSize: u(28) }}>
                    <StrokeText stroke={u(6)}>UNLOCK</StrokeText>
                  </span>
                  <CoinAmount
                    amount={slotCost}
                    size={28}
                    afford={coins >= slotCost}
                  />
                </ChunkyButton>
              )}
            </Well>

            {adAvailable && (
              <Well
                className="pp-feature flex flex-wrap items-center justify-between"
                style={{ gap: u(14) }}
              >
                <span className="flex items-center" style={{ gap: u(12) }}>
                  <span
                    className="pp-halo flex shrink-0 items-center justify-center"
                    style={{ width: u(92), height: u(92) }}
                  >
                    <Icon name="spin" size={u(66)} />
                  </span>
                  <span style={{ fontSize: u(30) }}>
                    <StrokeText stroke={u(7)}>Free car spin</StrokeText>
                  </span>
                </span>
                <ChunkyButton
                  onClick={async () => {
                    const res = await watchRewardedAd(FREE_SPIN_PLACEMENT);
                    if (!res.ok) return;
                    useGame.getState().setSpinning(true);
                    useGame.getState().openPanel("spin");
                  }}
                  gradient={GRADIENTS.tealButton}
                  radius={16}
                  style={{ height: u(74), padding: `0 ${u(26)}` }}
                >
                  <span style={{ fontSize: u(26) }}>
                    <StrokeText stroke={u(6)}>WATCH AD</StrokeText>
                  </span>
                </ChunkyButton>
              </Well>
            )}

            {products.length > 0 && (
              <div
                className="flex flex-wrap items-center justify-between"
                style={{ gap: u(10) }}
              >
                <SectionLabel style={{ marginBottom: 0 }}>
                  SPECIAL OFFERS
                </SectionLabel>
                <span
                  className="pp-pearl-bank flex items-center"
                  style={{ gap: u(10), fontSize: u(26), lineHeight: 1 }}
                  title="Sky Pearls you have found and not spent yet"
                >
                  <StrokeText stroke={u(6)}>Your pearls:</StrokeText>
                  <PearlAmount amount={pearls} size={28} />
                </span>
              </div>
            )}
            {products.length > 0 && (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${u(250)}, 1fr))`,
                  gap: u(14),
                }}
              >
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    coins={coins}
                    pearls={pearls}
                    slots={slots}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

export default StorePanel;
