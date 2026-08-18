import { useEffect, useMemo, useState } from 'react';
import type { Engine } from '@game/shell/engine';
import { PLAYER_COLORS_CSS } from '@game/shell/renderer';
import { MeterTable } from './MeterTable';
import { useMenuNav } from './useMenuNav';

type IntermissionData = NonNullable<ReturnType<Engine['intermission']>>;
type Panel = IntermissionData['panels'][number];

const cardBtn: React.CSSProperties = {
  background: '#3b2f57',
  color: '#fff4d6',
  border: '2px solid #b88ae0',
  borderRadius: 10,
  padding: '10px 10px',
  minWidth: 110,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function PlayerPanel({ panel, engine, solo }: { panel: Panel; engine: Engine; solo: boolean }) {
  const [showMeters, setShowMeters] = useState(false);
  const pi = panel.player;
  const color = PLAYER_COLORS_CSS[pi];

  // Ordered action list mirrors the rendered button order — pads navigate it.
  const actions = useMemo(() => {
    const out: (() => void)[] = [];
    if (panel.classChoice) {
      for (const c of panel.classChoice.options) out.push(() => engine.chooseClassItem(pi, c.id));
    } else if (panel.classEquip) {
      for (const w of panel.classEquip.currentWeapons) out.push(() => engine.equipReplace(pi, w.slot));
      out.push(() => engine.stashPending(pi));
      out.push(() => engine.cancelEquip(pi));
    } else if (panel.chest) {
      if (panel.chest.pendingEquip) {
        for (const w of panel.chest.currentWeapons) out.push(() => engine.equipReplace(pi, w.slot));
        out.push(() => engine.stashPending(pi));
        out.push(() => engine.cancelEquip(pi));
      } else {
        for (const c of panel.chest.choices) out.push(() => engine.chooseChestOffer(pi, c.idx));
        out.push(() => engine.salvageForBits(pi));
        // engine guards affordability — indices must mirror the rendered buttons
        out.push(() => engine.rerollChest(pi));
      }
    } else if (panel.featChoices) {
      for (const c of panel.featChoices) out.push(() => engine.chooseFeat(pi, c.id));
    } else if (panel.boonChoices) {
      for (const c of panel.boonChoices) out.push(() => engine.chooseBoon(pi, c.id));
    } else if (panel.done && panel.peddler) {
      for (const o of panel.peddler) out.push(() => engine.buyPeddler(pi, o.idx));
    }
    return out;
  }, [panel, engine, pi]);

  const focus = useMenuNav({
    player: pi,
    count: actions.length,
    enabled: actions.length > 0,
    onConfirm: (i) => actions[i]?.(),
    onBack:
      panel.chest?.pendingEquip || panel.classEquip ? () => engine.cancelEquip(pi) : undefined,
    keyboard: pi === 0,
  });
  const focusStyle = (i: number): React.CSSProperties =>
    i === focus && actions.length > 0
      ? { outline: `3px solid ${color}`, outlineOffset: 2 }
      : {};

  return (
    <div
      data-player-panel={pi}
      style={{
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: '10px 14px',
        background: 'rgba(43,33,64,0.6)',
        minWidth: solo ? 300 : 250,
        maxWidth: solo ? 460 : 340,
        flex: '1 1 250px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ color, fontWeight: 800 }}>
          P{pi + 1} {panel.className} · Lv {panel.level}
        </span>
        <span style={{ opacity: 0.85 }}>⚔️ {panel.kills} · 💔 {panel.damageTaken}</span>
      </div>
      {panel.classChoice ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            🎓 Your training bears fruit — choose a {panel.className} technique!
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {panel.classChoice.options.map((c, i) => (
              <button
                key={c.id}
                onClick={() => engine.chooseClassItem(pi, c.id)}
                data-class-item={`${pi}-${c.id}`}
                style={{ ...cardBtn, border: '2px solid #8ce68c', ...focusStyle(i) }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 10, opacity: 0.9 }}>{c.desc}</div>
              </button>
            ))}
          </div>
        </>
      ) : panel.classEquip ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            Equip <span style={{ color: '#8ce68c' }}>{panel.classEquip.pendingEquip.name}</span> — replace what?
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {panel.classEquip.currentWeapons.map((w, i) => (
              <button
                key={w.slot}
                onClick={() => engine.equipReplace(pi, w.slot)}
                data-replace-slot={`${pi}-${w.slot}`}
                style={{ ...cardBtn, border: '2px solid #e8a020', background: '#57302f', ...focusStyle(i) }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>{w.name}</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>{w.desc}</div>
              </button>
            ))}
            <button
              onClick={() => engine.stashPending(pi)}
              data-action={`stash-${pi}`}
              style={{
                ...cardBtn,
                border: '2px dashed #b88ae0',
                background: 'transparent',
                minWidth: 70,
                ...focusStyle(panel.classEquip.currentWeapons.length),
              }}
            >
              🎒 Stash
            </button>
            <button
              onClick={() => engine.cancelEquip(pi)}
              data-action={`cancel-equip-${pi}`}
              style={{
                ...cardBtn,
                border: '2px solid #666',
                background: 'transparent',
                minWidth: 60,
                ...focusStyle(panel.classEquip.currentWeapons.length + 1),
              }}
            >
              ←
            </button>
          </div>
        </>
      ) : panel.chest ? (
        panel.chest.pendingEquip ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              Equip <span style={{ color: '#ffd97a' }}>{panel.chest.pendingEquip.name}</span> — replace what?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {panel.chest.currentWeapons.map((w, i) => (
                <button
                  key={w.slot}
                  onClick={() => engine.equipReplace(pi, w.slot)}
                  data-replace-slot={`${pi}-${w.slot}`}
                  style={{ ...cardBtn, border: '2px solid #e8a020', background: '#57302f', ...focusStyle(i) }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{w.name}</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>{w.desc}</div>
                </button>
              ))}
              <button
                onClick={() => engine.stashPending(pi)}
                data-action={`stash-${pi}`}
                style={{
                  ...cardBtn,
                  border: '2px dashed #b88ae0',
                  background: 'transparent',
                  minWidth: 70,
                  ...focusStyle(panel.chest.currentWeapons.length),
                }}
              >
                🎒 Stash
              </button>
              <button
                onClick={() => engine.cancelEquip(pi)}
                data-action={`cancel-equip-${pi}`}
                style={{
                  ...cardBtn,
                  border: '2px solid #666',
                  background: 'transparent',
                  minWidth: 60,
                  ...focusStyle(panel.chest.currentWeapons.length + 1),
                }}
              >
                ←
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              🧰 Chest{panel.pendingChests > 1 ? ` ×${panel.pendingChests}` : ''} — take a weapon?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {panel.chest.choices.map((c, i) => (
                <button
                  key={c.idx}
                  onClick={() => engine.chooseChestOffer(pi, c.idx)}
                  data-chest-weapon={`${pi}-${c.id}`}
                  style={{
                    ...cardBtn,
                    border: `2px solid ${c.kind === 'passive' ? '#9be8ff' : '#ffd97a'}`,
                    ...focusStyle(i),
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>
                    {c.kind === 'passive' ? '💠 ' : ''}
                    {c.name}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>{c.desc}</div>
                </button>
              ))}
              <button
                onClick={() => engine.salvageForBits(pi)}
                data-action={`salvage-${pi}`}
                style={{
                  ...cardBtn,
                  border: '2px dashed #ffd97a88',
                  background: 'transparent',
                  color: '#ffd97a',
                  ...focusStyle(panel.chest.choices.length),
                }}
              >
                Salvage
                <div style={{ fontSize: 10, opacity: 0.8 }}>+2 bits 🔩</div>
              </button>
              {panel.rerollCost !== null && (
                <button
                  onClick={() => engine.rerollChest(pi)}
                  disabled={panel.gold < panel.rerollCost}
                  data-action={`reroll-${pi}`}
                  style={{
                    ...cardBtn,
                    border: '2px dashed #9be8ff88',
                    background: 'transparent',
                    color: panel.gold >= panel.rerollCost ? '#9be8ff' : '#666',
                    ...focusStyle(panel.chest.choices.length + 1),
                  }}
                >
                  Reroll
                  <div style={{ fontSize: 10, opacity: 0.8 }}>{panel.rerollCost} 🪙</div>
                </button>
              )}
            </div>
          </>
        )
      ) : panel.featChoices ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            ⭐ Choose a feat — a keepsake for the whole run
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {panel.featChoices.map((c, i) => (
              <button
                key={c.id}
                onClick={() => engine.chooseFeat(pi, c.id)}
                data-feat={`${pi}-${c.id}`}
                style={{ ...cardBtn, border: '2px solid #ffb0c8', ...focusStyle(i) }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 10, opacity: 0.9, marginTop: 4 }}>{c.desc}</div>
              </button>
            ))}
          </div>
        </>
      ) : panel.boonChoices ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            Choose a boon{panel.pendingBoons > 1 ? ` (${panel.pendingBoons} left)` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {panel.boonChoices.map((c, i) => (
              <button
                key={c.id}
                onClick={() => engine.chooseBoon(pi, c.id)}
                data-boon={`${pi}-${c.id}`}
                style={{ ...cardBtn, ...focusStyle(i) }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 10, opacity: 0.9, marginTop: 4 }}>{c.desc}</div>
                {pi === 0 && <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>[{i + 1}]</div>}
              </button>
            ))}
          </div>
        </>
      ) : panel.peddler ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            🛒 The Wandering Peddler — {panel.gold} 🪙
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {panel.peddler.map((o, i) => (
              <button
                key={o.idx}
                onClick={() => engine.buyPeddler(pi, o.idx)}
                disabled={o.sold || panel.gold < o.price}
                data-peddler={`${pi}-${o.id}`}
                style={{
                  ...cardBtn,
                  opacity: o.sold ? 0.35 : 1,
                  border: `2px solid ${o.kind === 'snack' ? '#ffb0c8' : o.kind === 'passive' ? '#9be8ff' : '#ffd97a'}`,
                  color: !o.sold && panel.gold >= o.price ? '#fff4d6' : '#888',
                  ...focusStyle(i),
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {o.kind === 'snack' ? '🍬 ' : o.kind === 'passive' ? '💠 ' : ''}
                  {o.name}
                </div>
                <div style={{ fontSize: 10, opacity: 0.9 }}>{o.desc}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#ffd97a' }}>
                  {o.sold ? 'sold' : `${o.price} 🪙`}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.8, textAlign: 'center', padding: '8px 0' }}>ready ✓</div>
      )}
      {panel.done && panel.satchel.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 700, opacity: 0.9 }}>🎒 Satchel</div>
          {panel.satchel.map((it) => (
            <div key={it.idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, alignItems: 'center' }}>
              <span style={{ opacity: 0.9 }}>{it.name}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => engine.equipFromSatchel(pi, it.idx)}
                  disabled={!it.equippable}
                  data-satchel-equip={`${pi}-${it.idx}`}
                  style={{
                    background: it.equippable ? '#3b2f57' : 'transparent',
                    color: it.equippable ? '#8ce68c' : '#666',
                    border: `1px solid ${it.equippable ? '#8ce68c' : '#555'}`,
                    borderRadius: 6,
                    padding: '2px 8px',
                    cursor: it.equippable ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                    fontSize: 11,
                  }}
                >
                  equip
                </button>
                <button
                  onClick={() => engine.salvageFromSatchel(pi, it.idx)}
                  data-satchel-salvage={`${pi}-${it.idx}`}
                  style={{
                    background: 'transparent',
                    color: '#ffd97a',
                    border: '1px solid #ffd97a88',
                    borderRadius: 6,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 11,
                  }}
                >
                  +2 🔩
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {panel.done && panel.tinker.some((t) => t.next) && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 700, opacity: 0.9 }}>🔩 {panel.bits} bits — tinker?</div>
          {panel.tinker.map(
            (t) =>
              t.next && (
                <div key={t.slot} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                  <span style={{ opacity: 0.9 }}>{t.name}</span>
                  <button
                    onClick={() => engine.tinker(pi, t.slot)}
                    disabled={!t.affordable}
                    data-tinker={`${pi}-${t.slot}`}
                    style={{
                      background: t.affordable ? '#3b2f57' : 'transparent',
                      color: t.affordable ? '#ffd97a' : '#666',
                      border: `1px solid ${t.affordable ? '#ffd97a' : '#555'}`,
                      borderRadius: 6,
                      padding: '2px 8px',
                      cursor: t.affordable ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                      fontSize: 11,
                    }}
                  >
                    → {t.next} ({t.cost} 🔩)
                  </button>
                </div>
              ),
          )}
        </div>
      )}
      <button
        onClick={() => setShowMeters(!showMeters)}
        data-action={`toggle-meters-${pi}`}
        style={{
          background: 'transparent',
          color: '#b88ae0',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 11,
          marginTop: 6,
        }}
      >
        {showMeters ? '▲ hide' : '▼ damage details'}
      </button>
      {showMeters && <MeterTable meters={engine.meters(pi)} />}
    </div>
  );
}

export function IntermissionOverlay({ data, engine }: { data: IntermissionData; engine: Engine }) {
  // When everyone is done, any pad's A (or Enter) advances the wave.
  useMenuNav({
    player: 'any',
    count: 1,
    enabled: data.allDone,
    onConfirm: () => engine.continueToNextWave(),
  });
  const p1 = data.panels[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!p1) return;
      if (p1.boonChoices && !p1.chest) {
        const n = Number(e.key);
        if (n >= 1 && n <= p1.boonChoices.length) engine.chooseBoon(0, p1.boonChoices[n - 1]!.id);
      } else if (data.allDone && (e.key === 'Enter' || e.key === ' ')) {
        engine.continueToNextWave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p1, data.allDone, engine]);

  return (
    <div
      data-screen="intermission"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui',
        color: '#fff4d6',
        background: 'rgba(20,14,34,0.45)',
      }}
    >
      <div
        style={{
          background: 'rgba(43,33,64,0.94)',
          border: '3px solid #ffd97a',
          borderRadius: 16,
          padding: '16px 22px',
          maxWidth: '94vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          textAlign: 'center',
          boxShadow: '0 8px 40px #0008',
        }}
      >
        <h2 style={{ margin: '0 0 8px', color: '#ffd97a' }}>
          Wave {data.wave} cleared! ✨ <span style={{ fontSize: 14, opacity: 0.8 }}>💰 {data.gold}</span>
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {data.panels.map((panel) => (
            <PlayerPanel key={panel.player} panel={panel} engine={engine} solo={data.panels.length === 1} />
          ))}
        </div>
        <button
          onClick={() => engine.continueToNextWave()}
          disabled={!data.allDone}
          data-action="continue"
          style={{
            marginTop: 14,
            background: data.allDone ? '#ffd97a' : '#665c44',
            color: '#2b2140',
            border: 'none',
            borderRadius: 10,
            padding: '10px 26px',
            fontWeight: 800,
            fontSize: 16,
            cursor: data.allDone ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          {data.lastWaveOfAct ? 'Finish' : data.allDone ? 'Next wave ▶' : 'Waiting for picks…'}
        </button>
      </div>
    </div>
  );
}
