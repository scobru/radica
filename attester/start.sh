#!/bin/bash
# Start the Freenet node (auto-updating when it exits with code 42) and the attester;
# when either stops unexpectedly, the container stops and CapRover restarts it.
run_freenet() {
  while true; do
    freenet
    code=$?
    if [ "$code" -eq 42 ]; then
      echo "freenet update detected (exit 42), running freenet update..."
      freenet update || return 1
      continue
    fi
    return "$code"
  done
}

run_freenet &
node src/main.js &
wait -n
exit 1
