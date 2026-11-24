# keepalog-clock

A stopwatch and timer for Brave that keeps a log of the real clock time of everything you do with it.
Every flag, pause, resume, restart and stop is logged too, each with the actual time of day and how much stopwatch time had passed. Timers work the same way, including the end.
Features

Stopwatch

Start, Pause, Resume, Restart and Stop
Flag to mark a moment while it keeps running
Every event is logged with the real clock time and the elapsed time

Timer

Pick any number of minutes and start
+1 min and +5 min at any point. The log records the real time you pressed it and how much time was left after adding
Restart goes back to your original length
When it ends, the end time is logged and a notification pops up, even if the extension window is closed

Long-session alerts (stopwatch)

A warning pop-up near the taskbar every 2 hours, getting stronger the longer you go. It stays on screen until you click it
Buttons on the warning: Snooze 30 min and Stop now
Hard auto-pause at 10 hours, logged at the exact moment it happened
A badge on the toolbar icon shows how long you have been going (teal, then amber, then red)
The gear icon in the popup lets you change the warning interval, the auto-pause limit and the snooze length

ui and bit more details tp be tweaked soon!
