#!/bin/zsh
# Runs one Electron probe per NAME.list file in <dir>, all at once, and prints what worked.
# Usage: APP=basic|media ./round.sh <dir>
# A list holds one service per line. A list holding only "ALL" is the control: every lookup allowed.
# Results go to /tmp/machprobe/out (the probes write there). Compile the window check first: swiftc -O wins.swift -o /tmp/machprobe/wins
HERE=${0:A:h}
E=$HERE/../../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
OUT=/tmp/machprobe/out
rm -rf $OUT /tmp/machprobe/ud; mkdir -p $OUT /tmp/machprobe/ud
typeset -A pids
for l in $1/*.list; do
  id=${l:t:r}; sb=$OUT/$id.sb
  if grep -q '^ALL$' $l; then printf '(version 1)\n(allow default)\n(deny network*)\n' > $sb
  else
    printf '(version 1)\n(allow default)\n(deny network*)\n(deny mach-lookup)\n(allow mach-lookup (global-name-prefix "com.github.Electron.MachPortRendezvousServer"))\n' > $sb
    while read s; do [[ -n $s ]] && echo "(allow mach-lookup (global-name \"$s\") (xpc-service-name \"$s\"))" >> $sb; done < $l
  fi
  PROBE_ID=$id sandbox-exec -f $sb $E --no-sandbox $HERE/${APP:-basic} > $OUT/$id.log 2>&1 &
  # zsh stores the text "$!" if assigned straight into an array element.
  p=$!; pids[$id]=$p
done
# Wait until every probe has run its checks, then ask the window server while all are still open.
for id in ${(k)pids}; do
  for i in {1..60}; do grep -q '^done=' $OUT/$id.txt 2>/dev/null && break; kill -0 $pids[$id] 2>/dev/null || break; sleep 0.2; done
done
sleep 1
for id in ${(k)pids}; do echo "onscreen=$(/tmp/machprobe/wins $pids[$id])" >> $OUT/$id.txt; done
kill ${(v)pids}
wait
for id in ${(ko)pids}; do printf '%-28s %s\n' $id "$(tr '\n' ' ' < $OUT/$id.txt 2>/dev/null || echo CRASH)"; done
