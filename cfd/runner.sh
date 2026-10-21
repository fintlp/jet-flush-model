#!/bin/bash
# Job runner for the Jet Flush OpenFOAM reference case.
#
# Start it inside the OpenFOAM shell:   /bin/bash ~/Downloads/jetflush-cfd/runner.sh
# Stop it with Ctrl-C, or by closing the Terminal window.
#
# What it does: every 5 seconds it looks for job files in ~/Downloads/jetflush-cfd/jobs/ (written by Claude),
# runs them one after the other and writes the output to ~/Downloads/jetflush-cfd/logs/. It only accepts:
#   - OpenFOAM tools from a fixed list, directly or through "mpirun -np N",
#   - python3 scripts kept in ~/Downloads/jetflush-cfd/tools/,
#   - "fetch <file>": download one file of the public repository folder
#     https://raw.githubusercontent.com/fintlp/jet-flush-model/dev-2.0/cfd/ into tools/,
#   - "rmtimes": delete the time folders of the case (to restart it from scratch).
# Every command runs inside ~/Downloads/jetflush-cfd/cases/<case>/. Lines with shell operators, quotes, absolute
# paths, "~" or ".." are refused. A file named jobs/STOP stops the job that is running.
ROOT="${JETFLUSH_ROOT:-$HOME/Downloads/jetflush-cfd}"
JOBS="$ROOT/jobs"; LOGS="$ROOT/logs"; CASES="$ROOT/cases"; TOOLS="$ROOT/tools"
BASE="https://raw.githubusercontent.com/fintlp/jet-flush-model/dev-2.0/cfd"
mkdir -p "$JOBS" "$LOGS" "$CASES" "$TOOLS" "$JOBS/done"
[ -z "$WM_PROJECT_VERSION" ] && { echo "Run this inside the 'openfoam' shell."; exit 1; }
NP=$(sysctl -n hw.perflevel0.physicalcpu 2>/dev/null || sysctl -n hw.physicalcpu 2>/dev/null || nproc)
{ echo "runner started $(date)"; echo "OpenFOAM $WM_PROJECT_VERSION, performance cores $NP, $(python3 --version 2>&1)"; } > "$LOGS/runner.log"
ALLOWED="blockMesh snappyHexMesh checkMesh setFields decomposePar reconstructPar reconstructParMesh interFoam foamDictionary topoSet surfaceCheck foamListTimes foamToVTK postProcess"
ok_line() {
  case "$1" in *[\;\&\|\`\$\<\>\\\'\"]*|*..*|/*|*" /"*|*"~"*) return 1;; esac
  set -- $1
  case "$1" in
    python3) case "$2" in tools/*.py) [ -f "$ROOT/$2" ] && return 0;; esac; return 1;;
    mpirun) [ "$2" = "-np" ] || return 1; for a in $ALLOWED; do [ "$4" = "$a" ] && return 0; done; return 1;;
    fetch) [ $# -eq 2 ] || return 1; case "$2" in */*/*|"") return 1;; esac; return 0;;
    rmtimes) [ $# -eq 1 ] && return 0; return 1;;
    *) for a in $ALLOWED; do [ "$1" = "$a" ] && return 0; done; return 1;;
  esac
}
echo "Runner is waiting for jobs in $JOBS (Ctrl-C to stop). Log: $LOGS/runner.log"
while true; do
  # job files in name order (find instead of a shell glob: some bash builds crash on globs here)
  for J in $(find "$JOBS" -maxdepth 1 -type f -name "*.job" | sort); do
    [ -f "$J" ] || continue
    N=$(basename "$J" .job); L="$LOGS/$N.log"; ST="$LOGS/$N.status"
    CASE=$(head -1 "$J" | awk '$1=="case"{print $2}')
    case "$CASE" in ""|*/*|*..*) echo "rejected: first line must be 'case <name>'" > "$ST"; mv "$J" "$JOBS/done/"; continue;; esac
    mkdir -p "$CASES/$CASE"; echo "running" > "$ST"; : > "$L"
    echo "== job $N in cases/$CASE, $(date)" >> "$LOGS/runner.log"
    RC=0
    while IFS= read -r line <&3 || [ -n "$line" ]; do
      line="${line//@NP@/$NP}"
      [ -z "$line" ] && continue; case "$line" in "#"*|"case "*) continue;; esac
      if ! ok_line "$line"; then echo "REJECTED: $line" >> "$L"; RC=99; break; fi
      echo "== $(date +%H:%M:%S) $line" >> "$L"
      S=$(date +%s)
      set -- $line
      if [ "$1" = rmtimes ]; then
        (cd "$CASES/$CASE" && for d in $(find . -maxdepth 1 -type d -name "[0-9]*" | sed "s|^./||"); do case "$d" in 0|*[!0-9.e+-]*) continue;; esac; rm -rf "$d"; done; find . -maxdepth 1 -type d -name "processor*" -exec rm -rf {} + ; rm -rf postProcessing) >> "$L" 2>&1; RC=$?
      elif [ "$1" = fetch ]; then
        mkdir -p "$TOOLS/$(dirname "$2")"
        curl -fsSL "$BASE/$2" -o "$TOOLS/$2" >> "$L" 2>&1; RC=$?; ls -l "$TOOLS/$2" >> "$L" 2>&1
      else
        if [ "$1" = python3 ]; then (cd "$CASES/$CASE" && python3 "$ROOT/$2" "${@:3}") < /dev/null >> "$L" 2>&1 &
        elif [ "$1" = mpirun ] || [ "$1" = interFoam ]; then (cd "$CASES/$CASE" && caffeinate -i "$@") < /dev/null >> "$L" 2>&1 &   # keep the Mac awake while the solver runs
        else (cd "$CASES/$CASE" && "$@") < /dev/null >> "$L" 2>&1 & fi
        PID=$!
        while kill -0 $PID 2>/dev/null; do
          if [ -f "$JOBS/STOP" ]; then rm -f "$JOBS/STOP"; pkill -P $PID; kill $PID; echo "STOPPED by request" >> "$L"; fi
          sleep 2
        done
        wait $PID; RC=$?
      fi
      echo "== exit $RC after $(( $(date +%s) - S )) s" >> "$L"
      [ $RC -ne 0 ] && break
    done 3< "$J"
    if [ $RC -eq 0 ]; then echo "done" > "$ST"; else echo "failed $RC" > "$ST"; fi
    mv "$J" "$JOBS/done/"
  done
  sleep 5
done
