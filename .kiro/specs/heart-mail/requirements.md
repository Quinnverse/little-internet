# Requirements: Heart Mail

1. Mutual friends by home address; requests to unknown or blocked homes look identical to the sender.
2. Send, receive, unread, read, delete, reject, block, retry; sends are idempotent by clientId.
3. Every route authorizes the owner key and checks friendship and blocks on the server; rate limits apply.
4. A letter is valid only if `LetterSchema` accepts it (size limits, safe data URLs).
5. The UI shows success only after a 2xx answer; failures show the reason; retryable failures stay in the outbox.
6. Two devices: a letter sent while the recipient is offline arrives when they next open.
