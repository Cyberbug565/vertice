import './style.css';
import { getToken, setToken } from './api';
import { creationScreen, loginScreen, mainMenu } from './ui/screens';
import { startGame } from './game';
import { $ui, clearUi, h } from './ui/dom';
import { closeRecordPanel } from './ui/record';

const enter = (id: string) => {
  closeRecordPanel();
  void startGame(getToken()!, (reason) => {
    closeRecordPanel(); document.getElementById('game')!.replaceChildren();
    if (reason === 'auth' || reason === 'logout') setToken(null);
    toMenu();
  }, id).catch((e) => {
    clearUi(); document.getElementById('game')!.replaceChildren();
    $ui().append(h('div', { class: 'screen' }, h('div', { class: 'card narrow' }, h('h2', {}, 'No se pudo abrir la partida'), h('p', { class: 'error', role: 'alert' }, e.message), h('button', { class: 'btn primary', onclick: toMenu }, 'Volver a mis personajes'))));
  });
};

function toMenu() {
  if (!getToken()) return loginScreen(toMenu);
  void mainMenu({
    onEnter: enter,
    onCreate: () => creationScreen(enter, toMenu),
    onLogout: toMenu,
  });
}
toMenu();
