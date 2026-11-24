# Equilibrio del ciberware (v0.38)

Puntuación de poder de cada implante: 1 punto ≈ 1 nivel de habilidad (un atributo vale 3; 15 de salud, 1,8; 5 % de esquiva, 1,5…). Un arma integrada vale el 60 % del presupuesto de su rareza; una habilidad activa, el 55 %; una pasiva especial, el 45 %; un efecto único, el 70 %. Se genera con `python3 tools/equilibrio/ciberware.py`.

| Rareza | Objetivo | Antes | Después |
|---|---|---|---|
| comun | 2,6 | 0.6–3.8 (mediana 1.5) | 1.4–3.8 (mediana 2.0) |
| poco-comun | 3,2–3,8 | 1.0–2.5 (mediana 1.5) | 2.0–4.0 (mediana 3.0) |
| raro | 5,2 | 1.0–6.4 (mediana 3.0) | 2.0–6.4 (mediana 4.9) |
| epico | 7,8 | 2.2–15.0 (mediana 5.0) | 3.5–13.9 (mediana 7.5) |
| legendario | 11–13,5 | 5.0–15.4 (mediana 8.8) | 6.1–16.2 (mediana 11.1) |
| mitico | sin límite | 28.4–28.4 (mediana 28.4) | 50.6–50.6 (mediana 50.6) |

| Implante | Rareza | Antes | Después | Cambios |
|---|---|---:|---:|---|
| audifono-coclear | comun | 1.0 | 2.0 | efectos ×2.50, precio 220→350 |
| brazo-protesico | comun | 1.0 | 2.0 | efectos ×2.50, precio 380→350 |
| compartimento-oculto | comun | 1.8 | 1.8 | precio 800→300 |
| cortex-calculo | comun | 2.0 | 2.0 | precio 1500→350 |
| cortex-idiomas | comun | 1.0 | 2.0 | efectos ×2.50, precio 900→350 |
| cromo-protesis | comun | 1.0 | 2.0 | efectos ×2.50, precio 440→350 |
| cromo-taller | comun | 1.0 | 2.0 | efectos ×2.50, precio 380→350 |
| cyberdeck-basico | comun | 1.5 | 2.5 | efectos ×1.73, capacidad 4→3, precio 900→500 |
| dedo-conector | comun | 1.0 | 2.0 | efectos ×2.50, precio 900→350 |
| dedo-ganzua | comun | 0.7 | 1.4 | efectos ×2.50, precio 800→250 |
| dedo-linterna | comun | 1.0 | 2.0 | efectos ×2.50, precio 300→350 |
| digestivo-reciclador | comun | 3.5 | 3.5 | efectos ×0.74, precio 1400→1000 |
| filtro-neural | comun | 3.0 | 3.0 | precio 500→700 |
| glandula-calma-quimica | comun | 1.0 | 2.0 | efectos ×2.50, precio 1100→350 |
| interfaz-vehiculo | comun | 3.6 | 2.1 | efectos ×0.72, precio 750→350 |
| mano-firme | comun | 1.0 | 2.0 | efectos ×2.50, precio 1200→350 |
| modulador-voz | comun | 3.8 | 3.8 | efectos ×0.65, precio 900→1100 |
| oido-afinado | comun | 1.0 | 2.0 | separado de audifono-coclear, precio 700→350 · distinto de audifono-coclear |
| oido-filtro-ruido | comun | 1.5 | 2.5 | efectos ×1.73, precio 600→500 |
| ojo-contraste | comun | 2.0 | 2.0 | precio 1100→350 |
| ojo-lince | comun | 2.6 | 2.6 | precio 900→500 |
| optica-inspeccion | comun | 3.0 | 3.0 | precio 450→700 |
| piel-subdermica-ligera | comun | 1.5 | 3.0 | efectos ×1.73, precio 1800→700 |
| pierna-amortiguador | comun | 0.6 | 1.5 | efectos ×2.50, precio 1400→250 |
| pierna-protesica | comun | 3.0 | 3.0 | precio 400→700 |
| pulmon-apnea | comun | 1.0 | 2.0 | efectos ×2.50, precio 1300→350 |
| rinon-filtrante | comun | 3.5 | 3.5 | efectos ×0.74, precio 600→1000 |
| so-centinela-basico | comun | 1.0 | 2.0 | efectos ×2.50, precio 1600→350 |
| traductor-cultural | comun | 3.0 | 3.0 | precio 650→700 |
| brazo-blindaje-placas | poco-comun | 1.5 | 3.0 | efectos ×2.50, precio 3900→1550 |
| columna-carga | poco-comun | 1.2 | 3.0 | efectos ×2.50, precio 3400→1550 |
| cromo-circuito | poco-comun | 1.4 | 3.0 | efectos ×2.50, precio 1950→1500 |
| cromo-pinza | poco-comun | 2.0 | 4.0 | efectos ×1.90 |
| dedo-chip-pago | poco-comun | 1.7 | 3.4 | efectos ×1.88, capacidad 1→2, precio 1100→2250 |
| hombro-pivote | poco-comun | 1.0 | 2.0 | efectos ×2.50, precio 2900→1200 |
| mandibula-trituradora | poco-comun | 2.5 | 3.5 | efectos ×1.52, humanidad 3→2, precio 2900→1850 |
| mano-garra-escalada | poco-comun | 2.0 | 3.0 | efectos ×1.60, precio 1600→1900 |
| mano-palma-iman | poco-comun | 1.4 | 3.0 | efectos ×2.50, precio 2800→1500 |
| ojo-nocturno | poco-comun | 2.0 | 3.0 | efectos ×1.60, precio 1400→1900 |
| piel-tatuaje-vivo | poco-comun | 1.0 | 2.0 | efectos ×2.50, capacidad 1→2, precio 1200→1250 |
| bateria-ram-externa | raro | 2.0 | 5.0 | efectos ×2.50, precio 3600→3850 |
| brazo-estabilizador | raro | 2.0 | 5.0 | efectos ×2.50, precio 3600→3850 |
| brazo-refuerzo-hidraulico | raro | 2.0 | 5.0 | efectos ×2.50, precio 4200→3900 |
| brazos-asistencia | raro | 6.4 | 6.4 | capacidad 5→4, precio 1100→5300 |
| columna-flex | raro | 2.0 | 5.0 | efectos ×2.50, precio 3200→3850 |
| cortex-calma | raro | 3.3 | 4.3 | efectos ×2.50, humanidad 0→1, precio 3600→3300 |
| cortex-tactico | raro | 2.0 | 4.0 | efectos ×2.50, precio 4600→3050 |
| cromo-bio | raro | 2.5 | 5.0 | efectos ×2.08, precio 6400→3850 |
| cromo-corredor | raro | 2.2 | 5.6 | separado de pierna-muelle, efectos ×1.68, precio 5900→4400 |
| cromo-correo-brazo | raro | 1.4 | 3.6 | efectos ×2.50, precio 6600→2800 |
| cromo-correo-pierna | raro | 2.1 | 5.1 | efectos ×2.48, precio 6900→3950 |
| cromo-mordaza | raro | 3.5 | 4.5 | efectos ×1.49, precio 6800→3450 |
| cromo-optico | raro | 3.0 | 5.0 | efectos ×1.73, precio 8400→3850 |
| cromo-rotula | raro | 1.2 | 2.9 | efectos ×2.50, precio 7300→2500 |
| cromo-vigia | raro | 3.5 | 4.5 | efectos ×1.49, precio 8500→3450 |
| dedo-memoria | raro | 1.0 | 2.0 | efectos ×2.50, capacidad 1→2, precio 2600→2500 |
| dedo-pistola | raro | 4.1 | 5.1 | efectos ×2.50, precio 3800→3950 |
| dedo-veneno | raro | 1.6 | 3.4 | efectos ×2.50, precio 4200→2700 |
| esqueleto-ligero | raro | 1.8 | 4.2 | efectos ×2.50, precio 3800→3200 |
| estomago-sintetico | raro | 4.0 | 4.0 | precio 900→3050 |
| garras-retractiles | raro | 3.1 | 3.1 | precio 2200→2500 |
| glandula-adrenalina | raro | 2.9 | 2.9 | precio 1600→2500 |
| glandula-chispa | raro | 3.6 | 4.7 | efectos ×2.50, precio 3800→3550 |
| huesos-densos | raro | 3.0 | 5.2 | efectos ×1.73, precio 1900→4000 |
| implante-mandibula | raro | 2.0 | 5.0 | efectos ×2.50, precio 1200→3850 |
| implante-radar | raro | 4.3 | 5.3 | efectos ×1.43, precio 3400→4150 |
| implante-sprint | raro | 3.5 | 4.4 | efectos ×2.50, precio 4200→3300 |
| kairos-1 | raro | 8.9 | 8.9 | sin cambios (Kairós o base) |
| laringe-modulada | raro | 3.0 | 5.0 | efectos ×1.73, capacidad 1→2, precio 3100→3850 |
| mano-carterista | raro | 2.4 | 4.8 | efectos ×2.17, precio 3000→3700 |
| mano-quirurgica | raro | 2.5 | 5.0 | efectos ×2.08, precio 3400→3850 |
| nervios-dolor-cero | raro | 1.2 | 3.0 | efectos ×2.50, precio 3600→2500 |
| nervios-reflejos | raro | 3.0 | 6.0 | efectos ×1.73, precio 4800→4850 |
| oido-traductor-callejero | raro | 2.0 | 4.0 | efectos ×2.50, precio 2400→3050 |
| ojo-cazador-termico | raro | 4.3 | 5.3 | efectos ×1.43, precio 3800→4150 |
| ojo-horizonte | raro | 3.0 | 3.0 | efectos ×1.75, precio 4900→2500 |
| ojo-tasador | raro | 3.0 | 5.0 | efectos ×1.73, precio 3200→3850 |
| ojos-tacticos | raro | 5.5 | 5.5 | precio 1400→4300 |
| optica-analisis | raro | 4.6 | 5.6 | efectos ×2.50, precio 1700→4450 |
| palma-electrica | raro | 3.1 | 3.1 | precio 1800→2500 |
| piel-aislante | raro | 3.8 | 5.3 | efectos ×1.91, precio 3500→4150 |
| piel-ignifuga | raro | 3.8 | 5.3 | efectos ×1.91, precio 3300→4150 |
| pierna-ancla | raro | 2.5 | 5.0 | efectos ×2.11 |
| pierna-muelle | raro | 2.2 | 4.7 | efectos ×2.36, precio 4400→3600 |
| pierna-silenciosa | raro | 4.3 | 5.3 | efectos ×1.43, precio 4600→4150 |
| pulmon-filtro | raro | 3.3 | 3.3 | efectos ×2.50, precio 2800→2650 |
| refuerzo-sinaptico | raro | 3.6 | 5.1 | efectos ×1.44, precio 1500→3950 |
| regulador-ram-civil | raro | 2.2 | 4.8 | efectos ×2.36, precio 4200→3700 |
| regulador-sueno | raro | 4.0 | 4.0 | precio 1500→3050 |
| sangre-coagulante | raro | 2.3 | 2.3 | precio 3600→2500 |
| sangre-oxigeno | raro | 3.3 | 4.3 | efectos ×2.50, precio 3200→3300 |
| sistema-apoyo | raro | 6.0 | 6.0 | rareza comun→raro, precio 700→4850 |
| subdermico | raro | 4.8 | 4.8 | precio 1300→3700 |
| acelerador-neural | epico | 2.4 | 6.4 | efectos ×2.50, capacidad 10→6, humanidad 6→5, precio 3800→10000 |
| bateria-ram-doble | epico | 4.8 | 8.2 | efectos ×1.64, precio 10500→12650 |
| brazo-cuchilla-gemela | epico | 2.8 | 6.6 | efectos ×2.50, precio 12500→10200 |
| brazo-garfio | epico | 6.3 | 8.3 | efectos ×1.95, precio 9800→12800 |
| brazo-torreta | epico | 5.5 | 7.5 | efectos ×2.15, precio 14000→11550 |
| cara-mascara-sintetica | epico | 6.5 | 7.5 | efectos ×1.43, capacidad 2→3, precio 11000→11550 |
| coprocesador | epico | 6.0 | 6.0 | precio 2600→9500 |
| corazon-reactor | epico | 5.3 | 7.8 | efectos ×2.38, precio 12000→12050 |
| cortex-critico | epico | 6.0 | 7.8 | efectos ×1.72, precio 11000→11950 |
| cortex-marcador | epico | 6.3 | 8.3 | efectos ×1.95, precio 12000→12800 |
| cortex-memoria-cuantica | epico | 4.8 | 8.0 | efectos ×1.62, precio 13500→12300 |
| cromo-atlas | epico | 3.0 | 7.6 | efectos ×2.50, precio 24000→11650 |
| cromo-bastion | epico | 4.4 | 8.5 | efectos ×1.76, precio 27000→13200 |
| cromo-grua | epico | 4.0 | 7.9 | efectos ×1.97, precio 21500→12200 |
| cromo-modulo | epico | 3.2 | 7.3 | efectos ×2.47, precio 20100→11200 |
| cromo-servo | epico | 4.9 | 9.0 | efectos ×1.59, precio 18600→14050 |
| cromo-yelmo | epico | 5.0 | 7.5 | efectos ×1.56, precio 29000→11550 |
| cuchillas-antebrazo | epico | 9.0 | 9.0 | precio 3400→13950 |
| cyberdeck-operaciones | epico | 5.0 | 7.8 | efectos ×1.56, capacidad 9→6, precio 3200→11900 |
| dedo-filo-monomolecular | epico | 2.2 | 5.0 | efectos ×2.50, capacidad 2→3, precio 8600→8350 |
| dedo-gatillo-sinaptico | epico | 3.5 | 3.5 | capacidad 2→3, precio 9200→8000 |
| esqueleto-grafeno | epico | 4.5 | 8.2 | efectos ×1.73, precio 13000→12550 |
| esqueleto-titanio | epico | 6.3 | 6.3 | capacidad 7→6, precio 4600→9850 |
| hombro-lanzador | epico | 5.3 | 6.3 | efectos ×2.50, precio 10500→9850 |
| implante-overclock | epico | 6.3 | 8.3 | efectos ×1.95, precio 13500→12800 |
| implante-senuelo-holo | epico | 4.3 | 6.3 | separado de proyector-holografico, efectos ×2.50, precio 9500→9850 |
| kairos-2 | epico | 13.0 | 13.0 | sin cambios (Kairós o base) |
| mano-guante-choque | epico | 4.5 | 5.9 | efectos ×2.50, precio 8800→9400 |
| nervios-sinapsis-rapida | epico | 4.5 | 8.7 | efectos ×1.73, precio 12500→13500 |
| oido-sonar | epico | 4.2 | 8.1 | efectos ×1.86, precio 7600→12500 |
| ojo-microscopio | epico | 4.0 | 8.0 | efectos ×1.95, precio 8200→12300 |
| ojo-predictivo | epico | 7.4 | 7.4 | precio 9500→11350 |
| piel-camaleon | epico | 7.3 | 7.3 | precio 12000→11250 |
| piel-espejo | epico | 5.0 | 6.5 | efectos ×2.50, precio 13000→10150 |
| pierna-esprinter | epico | 2.4 | 6.0 | efectos ×2.50, precio 12500→9500 |
| pierna-patada-piston | epico | 4.5 | 5.9 | efectos ×2.50 |
| pierna-salto-reforzado | epico | 6.5 | 7.7 | efectos ×1.43, precio 11000→11850 |
| piernas-propulsion | epico | 5.8 | 7.9 | efectos ×2.50, precio 3900→12150 |
| piernas-salto | epico | 12.3 | 8.3 | efectos ×0.50, precio 2400→12800 |
| proyector-holografico | epico | 4.3 | 4.3 | precio 3300→8000 |
| puno-hidraulico | epico | 15.0 | 13.9 | efectos ×0.65, precio 2800→18000 |
| sangre-nanobots | epico | 7.5 | 7.5 | precio 10000→11550 |
| so-guardian | epico | 5.8 | 7.3 | efectos ×2.50, precio 12000→11250 |
| so-salto | epico | 5.2 | 6.4 | efectos ×2.50, precio 11500→10000 |
| biomonitor-experimental | legendario | 12.6 | 16.2 | efectos ×2.11, precio 7800→48300 |
| blindaje-reactivo | legendario | 8.0 | 10.9 | efectos ×2.02, precio 39000→38550 |
| brazo-desviador | legendario | 7.0 | 9.9 | efectos ×2.50, precio 40000→34900 |
| brazo-sismico | legendario | 8.6 | 10.9 | efectos ×1.68, precio 38000→38550 |
| camuflaje-optico | legendario | 11.9 | 11.9 | precio 5200→42150 |
| canon-antebrazo | legendario | 12.7 | 12.7 | precio 5200→45650 |
| corazon-segundo-aliento | legendario | 7.3 | 10.9 | efectos ×2.50, precio 44000→38550 |
| cortex-ejecutor | legendario | 7.0 | 8.9 | efectos ×2.50, precio 41000→31600 |
| cromo-asedio | legendario | 9.6 | 12.5 | efectos ×1.41, precio 65000→35850 |
| cromo-coloso | legendario | 9.0 | 15.0 | efectos ×1.50, precio 61000→43750 |
| cromo-titan | legendario | 9.2 | 11.5 | efectos ×1.47, precio 69000→33000 |
| cyberdeck-militar | legendario | 15.4 | 15.4 | capacidad 11→10, precio 9800→45250 |
| ice-aislamiento | legendario | 6.0 | 12.0 | efectos ×1.83, precio 4200→42800 |
| implante-berserk | legendario | 9.7 | 11.6 | efectos ×1.53, precio 36000→41000 |
| implante-francotirador | legendario | 9.1 | 12.1 | efectos ×1.83, precio 37000→43000 |
| implante-oraculo | legendario | 9.9 | 9.9 | precio 40000→34900 |
| implante-piel-titan | legendario | 6.9 | 11.3 | efectos ×1.59, precio 43000→40050 |
| implante-quimera | legendario | 7.2 | 12.5 | efectos ×1.53, precio 48000→44850 |
| implante-sombra | legendario | 10.1 | 12.1 | efectos ×1.38, precio 41000→43000 |
| kairos-3 | legendario | 20.5 | 20.5 | sin cambios (Kairós o base) |
| kairos-4 | legendario | 23.2 | 23.2 | sin cambios (Kairós o base) |
| kairos-5 | legendario | 30.3 | 30.3 | sin cambios (Kairós o base) |
| latigo-monofilamento | legendario | 6.6 | 6.6 | precio 6100→25000 |
| mano-vampiro | legendario | 6.2 | 8.0 | efectos ×2.50, precio 34000→28600 |
| nervios-modo-dios | legendario | 10.9 | 10.9 | precio 47000→38150 |
| oido-escucha-remota | legendario | 5.0 | 11.0 | efectos ×2.20, capacidad 4→5, precio 28000→38750 |
| ojo-absoluto | legendario | 12.8 | 12.8 | efectos ×0.77, precio 42000→46400 |
| ojo-espectral | legendario | 15.0 | 14.0 | efectos ×0.60, precio 36000→52300 |
| ojo-panorama | legendario | 6.9 | 6.9 | efectos ×1.60, precio 36500→25650 |
| pierna-salto-felino | legendario | 10.4 | 10.4 | precio 39000→36300 |
| pulso-emp | legendario | 6.1 | 6.1 | precio 5900→25000 |
| reflejos-sobrealimentados | legendario | 6.1 | 6.1 | precio 6800→25000 |
| regulador-ram | legendario | 7.7 | 10.9 | efectos ×1.43, capacidad 4→5, precio 32000→38350 |
| segundo-corazon | legendario | 9.4 | 9.4 | precio 9500→27900 |
| so-tormenta | legendario | 8.1 | 11.1 | efectos ×2.50, precio 45000→38900 |
| zocalo-matrices | legendario | 0.0 | 0.0 | sin cambios (Kairós o base) |
| kairos-6 | mitico | 28.4 | 50.6 | mítico único: roto a propósito |
