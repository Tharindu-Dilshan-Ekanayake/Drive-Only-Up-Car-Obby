import { NITROS, PAINTS } from "@shared/cosmetics";
import { carById } from "@shared/cars";

import { sfx } from "../../audio/sfx";
import { actions } from "../../net/actions";
import { useGame } from "../../store/game";
import Icon from "../Icon";
import StrokeText from "../StrokeText";
import { ChunkyButton, CoinAmount } from "../hud/parts";
import { GRADIENTS, u } from "../hud/style";
import { Well } from "./Panel";

/**
 * The Store's PAINT and NITRO tabs (shared/cosmetics.js): a card per colour with a
 * swatch, its name and one button - its price (buys and puts it on), EQUIP if you own
 * it, or EQUIPPED. Bought with coins; the server checks the price and ownership.
 */

const RAINBOW =
  "linear-gradient(180deg, #ff4a3d 0%, #ffc21f 22%, #6cff3a 44%, #3fd9ff 66%, #b45cff 88%)";

/** A glossy paint blob: the colour with a highlight and a darker rim. */
function PaintSwatch({ color }) {
  return (
    <span
      className="pp-swatch block"
      style={{
        width: u(96),
        height: u(96),
        borderRadius: "50%",
        border: `${u(5)} solid #0d1530`,
        background: `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.85) 0 ${u(9)}, rgba(255,255,255,0) ${u(26)}), radial-gradient(circle at 50% 60%, ${color} 55%, color-mix(in srgb, ${color} 62%, #000) 100%)`,
        boxShadow: `0 ${u(5)} 0 rgba(13,21,48,0.35)`,
      }}
    />
  );
}

/** A nitro flame: a teardrop pointing up, white-hot at the bottom. */
function FlameSwatch({ color, rainbow }) {
  const fill = rainbow
    ? RAINBOW
    : `linear-gradient(0deg, #ffffff 0%, ${color} 38%, color-mix(in srgb, ${color} 55%, transparent) 100%)`;
  return (
    <span
      className="flex items-end justify-center"
      style={{ width: u(96), height: u(96) }}
    >
      <span
        className={`pp-flame block${rainbow ? " pp-flame-rainbow" : ""}`}
        style={{
          width: u(56),
          height: u(86),
          borderRadius: "50% 50% 50% 50% / 62% 62% 38% 38%",
          border: `${u(5)} solid #0d1530`,
          background: fill,
          boxShadow: `0 0 ${u(18)} ${rainbow ? "#ffc21f" : color}`,
        }}
      />
    </span>
  );
}

function CosmeticCard({ kind, item, owned, equipped, coins, swatch }) {
  const afford = coins >= item.price;
  const onClick = () => {
    if (equipped) return;
    if (owned) {
      sfx.click();
      actions.equipCosmetic(kind, item.id);
      return;
    }
    if (!afford) {
      sfx.error();
      useGame.getState().showToast("Not enough coins", "error");
      return;
    }
    sfx.buy();
    actions.buyCosmetic(kind, item.id);
  };
  return (
    <Well
      className="pp-product flex flex-col items-center text-center"
      style={{
        gap: u(8),
        paddingTop: u(18),
        outline: equipped ? `${u(4)} solid #3fd97a` : "none",
      }}
    >
      {swatch}
      <span style={{ fontSize: u(26) }}>
        <StrokeText stroke={u(6)}>{item.name}</StrokeText>
      </span>
      <ChunkyButton
        onClick={onClick}
        disabled={equipped}
        gradient={
          equipped
            ? GRADIENTS.greenButton
            : owned
              ? GRADIENTS.tealButton
              : afford
                ? GRADIENTS.goldButton
                : GRADIENTS.greyButton
        }
        radius={14}
        style={{
          height: u(60),
          padding: `0 ${u(18)}`,
          marginTop: "auto",
          minWidth: u(150),
          gap: u(8),
        }}
      >
        {equipped ? (
          <>
            <Icon name="check" size={u(30)} />
            <span style={{ fontSize: u(22) }}>
              <StrokeText stroke={u(5)}>EQUIPPED</StrokeText>
            </span>
          </>
        ) : owned ? (
          <span style={{ fontSize: u(24) }}>
            <StrokeText stroke={u(5)}>EQUIP</StrokeText>
          </span>
        ) : item.price === 0 ? (
          <span style={{ fontSize: u(24) }}>
            <StrokeText stroke={u(5)}>FREE</StrokeText>
          </span>
        ) : (
          <CoinAmount amount={item.price} size={26} afford={afford} />
        )}
      </ChunkyButton>
    </Well>
  );
}

const grid = {
  gridTemplateColumns: `repeat(auto-fill, minmax(${u(200)}, 1fr))`,
  gap: u(14),
};

export function PaintShop() {
  const coins = useGame((s) => s.profile.coins || 0);
  const owned = useGame((s) => s.profile.paints) || ["stock"];
  const equipped = useGame((s) => s.profile.paint) || "stock";
  const carId = useGame((s) => s.profile.car);
  const factory = carById(carId)?.colors?.body || "#b8c4cf";
  return (
    <div className="grid" style={grid}>
      {PAINTS.map((p) => (
        <CosmeticCard
          key={p.id}
          kind="paint"
          item={p}
          owned={owned.includes(p.id)}
          equipped={equipped === p.id}
          coins={coins}
          swatch={<PaintSwatch color={p.color || factory} />}
        />
      ))}
    </div>
  );
}

export function NitroShop() {
  const coins = useGame((s) => s.profile.coins || 0);
  const owned = useGame((s) => s.profile.nitros) || ["classic"];
  const equipped = useGame((s) => s.profile.nitro) || "classic";
  return (
    <div className="grid" style={grid}>
      {NITROS.map((n) => (
        <CosmeticCard
          key={n.id}
          kind="nitro"
          item={n}
          owned={owned.includes(n.id)}
          equipped={equipped === n.id}
          coins={coins}
          swatch={<FlameSwatch color={n.color} rainbow={n.rainbow} />}
        />
      ))}
    </div>
  );
}
