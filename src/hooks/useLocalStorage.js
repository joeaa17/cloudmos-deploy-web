import { useEffect, useState } from "react";
import { useEventListener } from "usehooks-ts";
import { getSelectedStorageWallet } from "../shared/utils/walletUtils";

export const useLocalStorage = () => {
  const selectedNetworkId = localStorage.getItem("selectedNetworkId");

  const getLocalStorageItem = (key) => {
    const selectedWallet = getSelectedStorageWallet();
    return localStorage.getItem(`${selectedNetworkId}/${selectedWallet.address}/${key}`);
  };

  const setLocalStorageItem = (key, value) => {
    const selectedWallet = getSelectedStorageWallet();
    localStorage.setItem(`${selectedNetworkId}/${selectedWallet.address}/${key}`, value);
  };

  const removeLocalStorageItem = (key) => {
    const selectedWallet = getSelectedStorageWallet();
    localStorage.removeItem(`${selectedNetworkId}/${selectedWallet.address}/${key}`);
  };

  return {
    removeLocalStorageItem,
    setLocalStorageItem,
    getLocalStorageItem
  };
};

export function useCustomLocalStorage(key, initialValue) {
  // Get from local storage then
  // parse stored json or return initialValue
  const readValue = () => {
    // Prevent build error "window is undefined" but keep keep working
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? parseJSON(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  };

  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState(readValue);

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value) => {
    // Prevent build error "window is undefined" but keeps working
    if (typeof window == "undefined") {
      console.warn(`Tried setting localStorage key “${key}” even though environment is not a client`);
    }

    try {
      // Allow value to be a function so we have the same API as useState
      const newValue = value instanceof Function ? value(storedValue) : value;

      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(newValue));

      // Save state
      setStoredValue(newValue);

      // We dispatch a custom event so every useLocalStorage hook are notified
      window.dispatchEvent(new Event("local-storage"));
    } catch (error) {
      console.warn(`Error setting localStorage key “${key}”:`, error);
    }
  };

  useEffect(() => {
    setStoredValue(readValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStorageChange = () => {
    setStoredValue(readValue());
  };

  // this only works for other documents, not the current one
  useEventListener("storage", handleStorageChange);

  // this is a custom event, triggered in writeValueToLocalStorage
  // See: useLocalStorage()
  useEventListener("local-storage", handleStorageChange);

  return [storedValue, setValue];
}

// A wrapper for "JSON.parse()"" to support "undefined" value
function parseJSON(value) {
  try {
    return value === "undefined" ? undefined : JSON.parse(value ?? "");
  } catch (error) {
    return value === "undefined" ? undefined : value;
  }
}
