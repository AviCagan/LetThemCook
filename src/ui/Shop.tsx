import { save, screen, showToast } from '../state';
import { persistSave } from '../save/store';
import { CATALOG, SLOTS, SLOT_LABEL, equip, equipped, owns, purchase, type ShopItem } from '../shop';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';

/** Coins buy cosmetic lab upgrades, a lab pet and new customers. Nothing here changes scoring. */
export function Shop() {
  const s = save.value!;
  const act = (item: ShopItem) => {
    const d = save.value!;
    if (owns(d, item)) {
      if (equip(d, item)) {
        sfx.click();
        showToast(`${item.name} in the lab`);
      }
    } else if (purchase(d, item)) {
      sfx.success(3);
      showToast(item.slot === 'customer' ? `${item.name} will start visiting the lab!` : `Bought ${item.name}!`);
    } else {
      sfx.fizzle();
      showToast(`You need ${item.cost - d.economy.coins} more coins.`);
      return;
    }
    persistSave(d);
    save.value = { ...d };
  };
  return (
    <div class="screen shop">
      <div class="row space">
        <h2><img class="icon" src={spriteDataUrl('ic_shop', 0, 2)} alt="" /> Lab shop</h2>
        <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); screen.value = 'title'; }}>Close</button>
      </div>
      <p class="row gap"><span class="chip"><img class="icon" src={spriteDataUrl('ic_coin', 0, 2)} alt="" /> {s.economy.coins} coins</span>
        <span class="muted small">Earn coins with stars and combos. Purely cosmetic: nothing here makes orders easier.</span></p>
      {SLOTS.map((slot) => {
        const on = slot === 'customer' ? null : equipped(s, slot).id;
        return (
          <section key={slot} class="shop-section">
            <h3>{SLOT_LABEL[slot]}</h3>
            <div class="shop-grid">
              {CATALOG.filter((i) => i.slot === slot).map((item) => {
                const have = owns(s, item);
                const isOn = on === item.id;
                const afford = s.economy.coins >= item.cost;
                return (
                  <button key={item.id} type="button" class={`shop-card ${isOn ? 'is-on' : ''} ${have ? 'is-owned' : ''}`} disabled={(!have && !afford) || isOn || (have && item.slot === 'customer')} onClick={() => act(item)} aria-label={`${item.name}: ${isOn ? 'in use' : have ? 'owned' : `${item.cost} coins`}`}>
                    <img src={spriteDataUrl(item.preview, item.frame ?? 0, 4)} alt="" />
                    <span class="shop-name">{item.name}</span>
                    <span class="shop-price">
                      {isOn ? 'In the lab' : have ? (item.slot === 'customer' ? 'Visiting' : 'Use') : <><img class="icon" src={spriteDataUrl('ic_coin', 0, 1)} alt="" /> {item.cost}</>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
