---
'@power-rent/try-catch': patch
---

`Try.throwThroughErrorTypes` writes the same static slot that every throw-through check reads, so configuring the registry through a subclass takes effect: `class MyTry extends Try {}` followed by `MyTry.throwThroughErrorTypes(['ValidationError'])` exempts `ValidationError` for `MyTry` and `Try` alike.
