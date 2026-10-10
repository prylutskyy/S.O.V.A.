# Ознаки запиту та утримання від висновку

Контрольовані варіанти: baseline (171 приклад, ознаки v1); pilot (225, v1); relations (225, v2); guarded (ті самі ваги v2 із перевіркою достатності ознак). Кожна модель має 65 544 параметри. Пороги 0.60/0.15 не знижувалися. Runtime зберігає baseline.

| Частина | Варіант | Сирий точний тип | Правильних прийнятих | Неоднозначні: ABSTAIN | Хибний впевнений SAFE на загрозі |
|---|---|---:|---:|---:|---:|
| train | baseline | 29/36 | 29/36 | 1/18 | 7 |
| train | pilot | 36/36 | 36/36 | 1/18 | 0 |
| train | relations | 36/36 | 36/36 | 2/18 | 0 |
| train | guarded | 36/36 | 36/36 | 15/18 | 0 |
| validation | baseline | 10/12 | 10/12 | 0/6 | 2 |
| validation | pilot | 11/12 | 11/12 | 0/6 | 1 |
| validation | relations | 12/12 | 12/12 | 0/6 | 0 |
| validation | guarded | 12/12 | 11/12 | 3/6 | 0 |
| test | baseline | 7/12 | 7/12 | 0/6 | 5 |
| test | pilot | 10/12 | 7/12 | 0/6 | 1 |
| test | relations | 11/12 | 11/12 | 1/6 | 0 |
| test | guarded | 11/12 | 11/12 | 4/6 | 0 |

## Старі приклади

| Частина | Варіант | Сирий точний тип | Правильних прийнятих | Покриття |
|---|---|---:|---:|---:|
| development | baseline | 99/100 | 97/100 | 98.0% |
| development | pilot | 99/100 | 97/100 | 98.0% |
| development | relations | 98/100 | 96/100 | 97.0% |
| development | guarded | 98/100 | 89/100 | 90.0% |
| regressions | baseline | 109/113 | 107/113 | 96.5% |
| regressions | pilot | 109/113 | 107/113 | 96.5% |
| regressions | relations | 108/113 | 106/113 | 96.5% |
| regressions | guarded | 108/113 | 96/113 | 87.6% |
| holdout | baseline | 94/113 | 88/113 | 91.2% |
| holdout | pilot | 94/113 | 90/113 | 91.2% |
| holdout | relations | 94/113 | 88/113 | 92.0% |
| holdout | guarded | 94/113 | 83/113 | 86.7% |

## Обмеження

- Pilot splits are now historical development checks, not blind validation.
- Diagnostic cases were authored during feature development, not independent holdout.
- Abstention policy is deterministic evidence validation, not a learned ambiguity class or probability calibration.
- Higher abstention reduces coverage; inspect accepted exact, false SAFE, and safe refusals together.
- No variant changes protection actions.

CPU: AMD Ryzen 7 6800H with Radeon Graphics         ; пік процесу з чотирма моделями 79.9 MiB. Навчання виконується окремо. Це не пам'ять усього розширення.

- baseline: p95 1.83 мс, максимум 2.40 мс, таймаутів 0.
- pilot: p95 1.79 мс, максимум 2.63 мс, таймаутів 0.
- relations: p95 1.95 мс, максимум 2.60 мс, таймаутів 0.
- guarded: p95 1.96 мс, максимум 2.93 мс, таймаутів 0.

[Повний JSON: усі прогнози, відмови й діагностика](../../tests/results/request-relations.json). Відтворення: `npm run classifier:relations`.
