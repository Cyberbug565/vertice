import type { ClientMsg, UnderworldJobView, UnderworldStatus, UnderworldView } from '@vertice/shared';
import { newOpId, type Net } from '../net';
import { fmtMoney, h, ask } from './dom';
import { showPanel } from './life';

export function updateDeliveryClock(now: number) {
  for (const clock of document.querySelectorAll<HTMLElement>('[data-underworld-deadline]')) {
    const remaining = Math.max(0, Math.ceil((Number(clock.dataset.underworldDeadline) - now) / 1000));
    clock.textContent = remaining === 0 ? 'Plazo vencido' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    clock.classList.toggle('netbad', remaining < 25);
  }
}

export function jobBrief(job: UnderworldJobView, net: Net, compact = false) {
  const brief = job.phase === 'cash' ? `Entrega en ${job.place}` : `Venta con ${job.target}`;
  return h('div', { class: compact ? 'underworld-goal' : 'choice underworld-order' },
    h('b', {}, brief),
    job.deadline ? h('time', { class: 'mono underworld-clock', 'data-underworld-deadline': job.deadline, 'aria-label': 'Plazo de entrega' }) : null,
    h('span', { class: 'small muted underworld-order-detail' }, job.phase === 'cash'
      ? `${fmtMoney(job.cash ?? 0)} de la banda${compact ? '' : ` · comisión ${fmtMoney(job.commission ?? 0)} · ${job.target}`}`
      : `${job.qty} × ${job.item} · ${job.place}`),
    h('button', { class: 'btn small', onclick: () => {
      document.getElementById('underworld-panel')?.remove();
      document.getElementById('journal-panel')?.remove();
      net.send({ t: 'underworld', action: 'track' });
    } }, 'Marcar ruta'));
}

export function undergroundStanding(status: UnderworldStatus) {
  const crew = status.membership;
  return h('div', { class: 'underworld-standing' },
    h('b', {}, `Reputación en los bajos fondos ${status.rep}`),
    h('span', { class: 'muted' }, crew ? `${crew.name} · ${crew.rank} · ${crew.deliveries} entregas` : 'Independiente'),
    crew ? h('small', { class: 'netmid' }, `Rivales · ${crew.rivals.join(', ')}`) : null);
}

export function underworldPanel(net: Net, v: UnderworldView) {
  const send = (action: Extract<ClientMsg, { t: 'underworld' }>['action'], ref?: string, qty?: number) => net.send({ t: 'underworld', action, site: v.site, ref, qty, opId: newOpId() });
  const order = v.status.job;
  const member = v.status.membership;
  const header = h('div', { class: 'underworld-top' }, h('p', { class: 'muted' }, `${v.name} · ${v.place}`), h('span', { class: 'mono cy' }, fmtMoney(v.money)));
  const standing = undergroundStanding(v.status);
  const summary = order ? jobBrief(order, net) : null;
  if (v.kind === 'base') {
    showPanel('underworld-panel', 'Entrega a la banda', header, standing, summary,
      v.currentStop && order?.phase === 'cash' ? h('button', { class: 'btn primary', onclick: () => send('deliver') }, 'Entregar la recaudación')
        : h('p', { class: 'muted' }, 'El contable solo recoge el dinero de los encargos asignados a esta base.'));
    updateDeliveryClock(Date.now() + net.clockOffset);
    return;
  }
  if (v.kind === 'buyer') {
    const deals = !member ? h('div', { class: 'underworld-grid' }, ...v.goods.map((g) => {
      const lot = Math.min(5, g.qty);
      return h('article', { class: 'choice' }, h('h4', {}, g.name),
        h('p', { class: 'mono' }, `${fmtMoney(g.price)} por unidad · llevas ${g.qty}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', disabled: !lot, onclick: () => send('sell', g.id, 1), 'aria-label': `Vender 1 × ${g.name}` }, 'Vender 1'),
          lot > 1 ? h('button', { class: 'btn small', onclick: () => send('sell', g.id, lot), 'aria-label': `Vender ${lot} × ${g.name}` }, `Vender ${lot}`) : null));
    })) : null;
    showPanel('underworld-panel', 'Venta en la calle', header, standing, summary,
      h('p', { class: 'netmid' }, `Riesgo de incidente ${Math.round((v.risk ?? 0) * 100)} %`),
      v.currentStop && order?.phase === 'sale' ? h('button', { class: 'btn primary', onclick: () => send('collect') }, 'Vender el lote de la banda')
        : member ? h('p', { class: 'muted' }, 'Tu contacto te indica con quién tratar en cada encargo.') : deals);
    return;
  }

  const stock = h('div', { class: 'underworld-grid' }, ...v.goods.map((g) => h('article', { class: 'choice' },
    h('h4', {}, g.name), h('p', { class: 'muted' }, g.desc),
    h('p', { class: 'mono' }, `${fmtMoney(g.price)} por unidad · llevas ${g.qty}`),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', disabled: v.money < g.price, onclick: () => send('buy', g.id, 1), 'aria-label': `Comprar 1 × ${g.name}` }, 'Comprar 1'),
      h('button', { class: 'btn small', disabled: v.money < g.price * 5, onclick: () => send('buy', g.id, 5), 'aria-label': `Comprar 5 × ${g.name}` }, 'Comprar 5')))));
  const markets = h('div', { class: 'underworld-grid' }, ...v.markets.map((m) => h('article', { class: 'choice' },
    h('h4', {}, m.place),
    h('p', { class: 'muted' }, `${m.name} · controla ${m.controller}`),
    h('ul', {}, ...m.prices.map((p) => h('li', { class: 'mono' }, `${p.name} · ${fmtMoney(p.price)}`))),
    h('p', { class: 'netmid' }, `Riesgo ${Math.round(m.risk * 100)} %`),
    h('button', { class: 'btn small', onclick: () => { send('quote', m.id); document.getElementById('underworld-panel')?.remove(); } }, 'Marcar comprador'))));
  const crews = h('div', { class: 'underworld-grid' }, ...v.crews.map((crew) => h('article', { class: 'choice' },
    h('h4', {}, crew.name),
    h('p', {}, crew.parent ? `Banda secundaria · responde a ${crew.parent}` : 'Organización principal'),
    h('p', { class: 'muted' }, `Entrada con ${crew.entryRep} de reputación · comisión ${Math.round(crew.commission * 100)} %`),
    h('small', { class: 'netmid' }, `Rivales · ${crew.rivals.join(', ')}`),
    !member ? h('button', { class: 'btn small', disabled: !crew.canJoin, onclick: () => send('join', crew.id) }, 'Pedir ingreso') : null)));
  const selection = h('select', { 'aria-label': 'Mercancía del encargo' }, ...v.goods.map((i) => h('option', { value: i.id }, i.name)));
  const manage = member ? h('div', { class: 'row underworld-controls' },
    order ? h('button', { class: 'btn small danger', onclick: () => { ask('Abandonar el encargo cuesta reputación. ¿Abandonar?', () => { send('abandon'); }, { danger: true }); } }, 'Abandonar el encargo') : selection,
    !order ? h('button', { class: 'btn small primary', onclick: () => send('accept', selection.value) }, 'Pedir un encargo') : null,
    !order ? h('button', { class: 'btn small', onclick: () => { ask('Al salir pierdes 2 de reputación y la protección. ¿Dejar la banda?', () => { send('leave'); }, { danger: true }); } }, 'Dejar la banda') : null) : null;
  const sections = [
    { label: 'Mercancía', title: 'Mercancía del contacto', node: stock },
    { label: 'Compradores', title: 'Compradores y cotizaciones', node: markets },
    { label: 'Bandas', title: 'Organizaciones', node: crews },
  ].map(({ label, title, node }) => ({ label, section: h('section', { class: 'underworld-section' }, h('h3', {}, title), node) }));
  const nav = h('nav', { class: 'row underworld-nav', 'aria-label': 'Secciones del mercado negro' },
    ...sections.map(({ label, section }) => h('button', { class: 'btn small', onclick: () => section.scrollIntoView({ block: 'start' }) }, label)));
  showPanel('underworld-panel', 'Mercado negro', header, standing, summary, manage, nav, ...sections.map(({ section }) => section));
  updateDeliveryClock(Date.now() + net.clockOffset);
}
