#!/bin/bash
unset EXPO_TOKEN
pnpm exec eas build --platform android --profile preview
