# Locking a gift with a PIN

Two very different mechanisms, depending on how the gift is delivered.

## Gift links created through the site — a real lock

When the sender fills in "Lock it with a PIN" on the create form, the story
is gated **on the server**. Open the link without the PIN and you get a lock
screen; the story's markup, photos and scripts are never sent. Enter the
right PIN and the server sets an HttpOnly cookie scoped to that one gift.

Details:

* Only a salted scrypt hash of the PIN is stored — never the PIN.
* The cookie holds a 32-byte random token that must match the one stored
  for that gift, so a cookie from one gift cannot open another.
* A missing gift answers exactly like a wrong PIN, so the endpoint cannot be
  used to discover which links exist.
* Ten wrong tries in ten minutes locks that visitor out, correct PIN
  included.
* Both the lock screen and the unlocked story are sent `no-store`, so no
  shared cache can hand the story to the next person on that connection.

Punctuation and case are ignored: `25/12/2015`, `25-12-2015` and `25122015`
are the same PIN, and so are `Paris` and `paris`. Minimum four characters
after that normalising.

### What it does not do

A date is a weak secret. "Their birthday" is four to eight digits and often
guessable by exactly the people who know the couple. This reliably stops a
surprise being opened early; it is not protection against someone
determined. Do not put anything in a gift that would genuinely harm you to
have read.

The attempt throttle lives in server memory, so on serverless hosting it
resets on a cold start and is not shared between instances. It slows a
casual guesser rather than stopping a scripted one.

## The standalone copy — a curtain, not a lock

`js/lockGate.js`, configured in `story.js`:

```js
lock: { enabled: true, pin: "2512", hint: "Your birthday — 4 digits" }
```

Off by default. This copy has no server, so **the PIN is in the page source**
and anyone who views source or opens developer tools can read it and walk
straight in. Use it to stop a casual glance spoiling the surprise. If you
need the real thing, send a gift link from the site instead.

An unlock is remembered in `localStorage` for that browser, so a reader who
refreshes is not asked again.
