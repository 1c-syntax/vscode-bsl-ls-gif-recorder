# Заметки

Наблюдения, сделанные при записи демо-каталога (июнь 2026, develop-сборки LS, Java 25, БСП
`4a4513f8`). Это снимки на дату записи: прежде чем ссылаться на пункт, перепроверьте его на
свежем jar (`tools/probes/`, сценарий).

| Заметка | Статус |
|---|---|
| [`DISPATCH-definition-expression-bug.md`](DISPATCH-definition-expression-bug.md) | **Ложная тревога.** F12 на вызове в выражении работает на develop: стенд использовал устаревший jar. Оставлено как пример того, почему сначала проверяют jar. |
| [`FINDINGS-definition-editor.md`](FINDINGS-definition-editor.md) | Краевые случаи go-to-definition, когда редактор и юнит-тесты расходятся. Не подтверждено как баг. |
| [`MISSING-FEATURES.md`](MISSING-FEATURES.md) | Кандидаты в issue. П.1 (completion членов общего модуля) исправлен в [#3988](https://github.com/1c-syntax/bsl-language-server/issues/3988). Остальные пункты требуют перепроверки. |
