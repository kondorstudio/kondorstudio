import React from "react";
import { stableStringify } from "@/components/reportsV2/utils.js";

const HISTORY_LIMIT = 50;

function resolveNextValue(updater, current) {
  return typeof updater === "function" ? updater(current) : updater;
}

function pushBoundedPast(past, snapshot) {
  const nextPast = [...past, snapshot];
  if (nextPast.length > HISTORY_LIMIT) {
    return nextPast.slice(nextPast.length - HISTORY_LIMIT);
  }
  return nextPast;
}

export default function useHistoryState(initialState) {
  const [history, setHistory] = React.useState(() => ({
    past: [],
    present: initialState,
    future: [],
    transientBase: null,
    transientBaseKey: "",
  }));

  const setState = React.useCallback((updater, options = {}) => {
    const snapshot = options?.snapshot !== false;

    setHistory((prev) => {
      const current = prev.present;
      const next = resolveNextValue(updater, current);
      const currentKey = stableStringify(current);
      const nextKey = stableStringify(next);

      if (!snapshot) {
        if (nextKey === currentKey) {
          return prev;
        }
        return {
          ...prev,
          present: next,
          transientBase: prev.transientBase || current,
          transientBaseKey: prev.transientBaseKey || currentKey,
        };
      }

      const base = prev.transientBase || current;
      const baseKey = prev.transientBaseKey || stableStringify(base);

      if (nextKey === baseKey) {
        return {
          ...prev,
          present: next,
          transientBase: null,
          transientBaseKey: "",
        };
      }

      const nextPast = pushBoundedPast(prev.past, base);
      return {
        past: nextPast,
        present: next,
        future: [],
        transientBase: null,
        transientBaseKey: "",
      };
    });
  }, []);

  const undo = React.useCallback(() => {
    setHistory((prev) => {
      if (prev.transientBase) {
        return {
          ...prev,
          present: prev.transientBase,
          transientBase: null,
          transientBaseKey: "",
        };
      }

      if (!prev.past.length) return prev;
      const previous = prev.past[prev.past.length - 1];
      const nextPast = prev.past.slice(0, -1);
      return {
        past: nextPast,
        present: previous,
        future: [prev.present, ...prev.future],
        transientBase: null,
        transientBaseKey: "",
      };
    });
  }, []);

  const redo = React.useCallback(() => {
    setHistory((prev) => {
      if (!prev.future.length) return prev;
      const nextPresent = prev.future[0];
      const nextFuture = prev.future.slice(1);
      const nextPast = pushBoundedPast(prev.past, prev.present);
      return {
        past: nextPast,
        present: nextPresent,
        future: nextFuture,
        transientBase: null,
        transientBaseKey: "",
      };
    });
  }, []);

  const resetState = React.useCallback((nextState) => {
    setHistory({
      past: [],
      present: nextState,
      future: [],
      transientBase: null,
      transientBaseKey: "",
    });
  }, []);

  const canUndo = history.past.length > 0 || Boolean(history.transientBase);
  const canRedo = history.future.length > 0;

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    resetState,
  };
}
