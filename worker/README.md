# Automatic previews and link checks

Single-page worker, isolated from the API. Spring stores observations in `link_insights`; personal link records, manual screenshots, notes and synchronization timestamps are never modified by the worker.

- Claims one leased job, opens an anonymous browser context, checks HTTP status and recognizable login/challenge pages, stores a viewport JPEG for accessible pages, completes the job, then pauses 45 seconds.
- Current URLs are checked before accepting a result. Expired leases are retried. Successful checks repeat after 30 days; missing/temporary failures after 2 days. Archived and deleted links are excluded.
- User-triggered rechecks move links forward in the queue. They do not recapture an existing automatic image. Its original capture date is displayed separately from the last link check.
- All browser HTTP requests are intercepted and fulfilled by `safe-fetch.mjs`. It validates every DNS answer and connects to a pinned public IPv4 address, retaining the hostname for TLS checks. Private/reserved addresses, IPv6, URL credentials, unusual ports, the application domain and configured host IPs are refused. Redirect destinations and subresources pass through the same path. Browser service workers and WebSockets are disabled; no authenticated browser cookies are imported.
- Requests, bytes, navigation time, process count, memory and CPU are bounded. No ports are exposed. Container runs as `node`, read-only, with dropped capabilities and disposable temporary directories.

Limitations: anonymous public pages only; IPv6-only destinations are skipped; bot protections/login screens may prevent capture; HTTP status cannot guarantee that content is still relevant. Screenshots are visual reminders, not full-page archives. Automatic images are cached offline when viewed. Existing ZIP/JSON backups preserve personal learning data and manual captures; server backups also preserve automatic observations and images.

Local validation: `npm test`; build with `docker build -t mesliens-previews:learning-v1 worker` from the repository root. The production Compose file starts the worker after deployment. Stop only this worker with `docker stop mesliens-previews` if resource pressure requires it.
