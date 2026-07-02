// Paste into the browser console on a visible Hacker News upvoted page.
// Copies newline-delimited HN thread URLs for the current page only.
copy([...document.querySelectorAll("tr.athing[id]")].map(row => `https://news.ycombinator.com/item?id=${row.id}`).join("\n"))
