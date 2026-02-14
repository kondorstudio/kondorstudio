import React, { createContext, useContext, useEffect, useState } from "react";
import SubscriptionExpiredModal from "./SubscriptionExpiredModal.jsx";

const SubscriptionContext = createContext({
  expired: false,
  setExpired: () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

function isSubscriptionError(reason) {
  if (!reason) return false;
  const status = reason.status || reason?.response?.status;
  if (status === 402) return true;
  const code =
    reason?.data?.code ||
    reason?.code ||
    reason?.response?.data?.code ||
    reason?.response?.code;
  return code === "SUBSCRIPTION_REQUIRED" || code === "SUBSCRIPTION_EXPIRED";
}

export function SubscriptionProvider({ children }) {
  const [expired, setExpired] = useState(false);
  const [isClientPortal, setIsClientPortal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname || "";
    setIsClientPortal(path.startsWith("/client"));
  }, []);

  useEffect(() => {
    function handleExpired() {
      if (!isClientPortal) {
        setExpired(true);
      }
    }

    function handleUnhandledRejection(event) {
      if (!isClientPortal && isSubscriptionError(event.reason)) {
        setExpired(true);
        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
      }
    }

    window.addEventListener("subscription_expired", handleExpired);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("subscription_expired", handleExpired);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [isClientPortal]);

  const value = { expired, setExpired };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      {!isClientPortal && expired && <SubscriptionExpiredModal />}
    </SubscriptionContext.Provider>
  );
}
