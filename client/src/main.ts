import './style.css';
import { getToken } from './api';
import { creationScreen, loginScreen, mainMenu } from './ui/screens';
import { startGame } from './game';

function toMenu() {
  if (!getToken()) return loginScreen(toMenu);
  void mainMenu({
    onEnter: () => void startGame(getToken()!, (reason) => { document.getElementById('game')!.replaceChildren(); if (reason === 'auth') localStorage.removeItem('vertice.token'); toMenu(); }),
    onCreate: () => creationScreen(() => void startGame(getToken()!, () => toMenu()), toMenu),
    onLogout: toMenu,
  });
}
toMenu();
