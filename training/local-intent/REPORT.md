# Порівняння локального класифікатора

| Частина | N | Точний тип: правила | Точний тип: модель | Покриття впевнених прогнозів | F1 виявлення: правила | F1 виявлення: модель |
|---|---:|---:|---:|---:|---:|---:|
| train | 171 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| validation | 40 | 100.0% | 87.5% | 90.0% | 100.0% | 92.7% |
| holdout | 113 | 100.0% | 88.5% | 92.0% | 100.0% | 90.3% |

Модель: 65 544 параметри, int16, 175636 байтів у JSON. Хеш даних: `26c7fbf081fca94da00b871b3dbcbec905170aabf22457aa9064dfdf48ebaed0`.

CPU: AMD Ryzen 7 6800H with Radeon Graphics         . Холодний прогноз: 1.36 мс; 200 прогнозів: медіана 1.51, p95 1.86, максимум 2.40 мс. Піковий RSS процесу оцінювання: 77.7 MiB; масив ваг: 256 KiB.

- Shadow only: no protection actions changed.
- Softmax scores are not calibrated probabilities.
- Accepted-only precision/recall exclude abstentions; consult coverage and exact over all cases.
- Holdout already used in historical rule development: not independent proof of generalization.
- This small synthetic corpus requires new independent real-world examples before promotion.

Деталі кожного сценарію: [JSON](../../tests/results/linear-classifier-latest.json).
