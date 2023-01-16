import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { mainnetId, mainnetNodes } from "../../shared/constants";
import { initiateNetworkData, networks } from "../../shared/networks";
import { migrateLocalStorage } from "../../shared/utils/localStorage";
import { queryClient } from "../../queries";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useStateWithCallbackLazy } from "use-state-with-callback";
import { initAppTypes } from "../../shared/init";

const SettingsProviderContext = React.createContext({});

const defaultSettings = {
  apiEndpoint: "",
  rpcEndpoint: "",
  isCustomNode: false,
  nodes: [],
  selectedNode: null,
  customNode: null
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useStateWithCallbackLazy(defaultSettings);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isRefreshingNodeStatus, setIsRefreshingNodeStatus] = useState(false);
  const { getLocalStorageItem, setLocalStorageItem } = useLocalStorage();
  const [selectedNetworkId, setSelectedNetworkId] = useState(localStorage.getItem("selectedNetworkId") || mainnetId);
  const { isCustomNode, customNode, nodes, apiEndpoint } = settings;

  // load settings from localStorage or set default values
  useEffect(() => {
    const initiateSettings = async () => {
      setIsLoadingSettings(true);

      // Set the versions and metadata of available networks
      await initiateNetworkData();
      
      // Apply local storage migrations
      migrateLocalStorage();

      // Init app types based on the selected network id
      initAppTypes();

      const settingsStr = getLocalStorageItem("settings");
      const settings = { ...defaultSettings, ...JSON.parse(settingsStr) } || {};
      let defaultApiNode, defaultRpcNode, selectedNode;

      // Set the available nodes list and default endpoints
      const currentNetwork = networks.find((x) => x.id === selectedNetworkId) || mainnetNodes;
      const response = await axios.get(process.env.REACT_APP_proxy+currentNetwork.nodesUrl);
      let nodes = response.data;

      const hasSettings =
        settingsStr && settings.apiEndpoint && settings.rpcEndpoint && settings.selectedNode && nodes.find((x) => x.id === settings.selectedNode.id);

      // if user has settings locally
      if (hasSettings) {
        nodes = nodes.map(async (node) => {
          const nodeStatus = await loadNodeStatus(node.api);

          return {
            ...node,
            status: nodeStatus.status,
            latency: nodeStatus.latency,
            nodeInfo: nodeStatus.nodeInfo
          };
        });

        defaultApiNode = settings.apiEndpoint;
        defaultRpcNode = settings.rpcEndpoint;
        selectedNode = settings.selectedNode;

        let customNode;

        if (settings.isCustomNode) {
          const nodeStatus = await loadNodeStatus(settings.apiEndpoint);
          const customNodeUrl = new URL(settings.apiEndpoint);

          customNode = {
            status: nodeStatus.status,
            latency: nodeStatus.latency,
            nodeInfo: nodeStatus.nodeInfo,
            id: customNodeUrl.hostname
          };
        }

        updateSettings({ ...settings, apiEndpoint: defaultApiNode, rpcEndpoint: defaultRpcNode, selectedNode, customNode });
        setIsLoadingSettings(false);

        // update the node statuses asynchronously
        nodes = await Promise.all(nodes);

        updateSettings({ ...settings, nodes });
      } else {
        nodes = await Promise.all(
          nodes.map(async (node) => {
            const nodeStatus = await loadNodeStatus(node.api);

            return {
              ...node,
              status: nodeStatus.status,
              latency: nodeStatus.latency,
              nodeInfo: nodeStatus.nodeInfo
            };
          })
        );

        // Set fastest one as default
        const randomNode = getFastestNode(nodes);
        defaultApiNode = randomNode.api;
        defaultRpcNode = randomNode.rpc;
        selectedNode = randomNode;

        updateSettings({ ...settings, apiEndpoint: defaultApiNode, rpcEndpoint: defaultRpcNode, selectedNode, nodes });
        setIsLoadingSettings(false);
      }
    };

    initiateSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load the node status from node_info endpoint
   * @param {*} nodeUrl
   * @returns
   */
  const loadNodeStatus = async (nodeUrl) => {
    const start = performance.now();
    let latency,
      status = "",
      nodeInfo = {};

    try {
      const response = await axios.get(process.env.REACT_APP_proxy+`${nodeUrl}/node_info`, { timeout: 10000 });
      nodeInfo = response.data;
      status = "active";
    } catch (error) {
      status = "inactive";
    } finally {
      const end = performance.now();
      latency = end - start;

      return {
        latency,
        status,
        nodeInfo
      };
    }
  };

  /**
   * Get the fastest node from the list based on latency
   * @param {*} nodes
   * @returns
   */
  const getFastestNode = (nodes) => {
    const filteredNodes = nodes.filter((n) => n.status === "active");
    let lowest = Number.POSITIVE_INFINITY,
      fastestNode;

    // No active node, return the first one
    if (filteredNodes.length === 0) {
      return nodes[0];
    }

    filteredNodes.forEach((node) => {
      if (node.latency < lowest) {
        lowest = node.latency;
        fastestNode = node;
      }
    });

    return fastestNode;
  };

  const updateSettings = (newSettings, callback) => {
    setSettings((prevSettings) => {
      clearQueries(prevSettings, newSettings);
      setLocalStorageItem("settings", JSON.stringify(newSettings));

      return newSettings;
    }, callback);
  };

  const clearQueries = (prevSettings, newSettings) => {
    if (prevSettings.apiEndpoint !== newSettings.apiEndpoint || (prevSettings.isCustomNode && !newSettings.isCustomNode)) {
      // Cancel and remove queries from cache if the api endpoint is changed
      queryClient.resetQueries();
      queryClient.cancelQueries();
      queryClient.removeQueries();
      queryClient.clear();
    }
  };

  /**
   * Refresh the nodes status and latency
   * @returns
   */
  const refreshNodeStatuses = useCallback(
    async (settingsOverride) => {
      if (isRefreshingNodeStatus) return;

      setIsRefreshingNodeStatus(true);
      let _nodes = settingsOverride ? settingsOverride.nodes : nodes;
      let _customNode = settingsOverride ? settingsOverride.customNode : customNode;
      let _isCustomNode = settingsOverride ? settingsOverride.isCustomNode : isCustomNode;
      let _apiEndpoint = settingsOverride ? settingsOverride.apiEndpoint : apiEndpoint;

      if (_isCustomNode) {
        const nodeStatus = await loadNodeStatus(_apiEndpoint);
        const customNodeUrl = process.env.REACT_APP_proxy+ new URL(_apiEndpoint);

        _customNode = {
          status: nodeStatus.status,
          latency: nodeStatus.latency,
          nodeInfo: nodeStatus.nodeInfo,
          id: customNodeUrl.hostname
        };
      } else {
        _nodes = await Promise.all(
          _nodes.map(async (node) => {
            const nodeStatus = await loadNodeStatus(node.api);

            return {
              ...node,
              status: nodeStatus.status,
              latency: nodeStatus.latency,
              nodeInfo: nodeStatus.nodeInfo
            };
          })
        );
      }

      setIsRefreshingNodeStatus(false);

      // Update the settings with callback to avoid stale state settings
      setSettings((prevSettings) => {
        const selectedNode = _nodes.find((node) => node.id === prevSettings.selectedNode.id);

        const newSettings = {
          ...prevSettings,
          nodes: _nodes,
          selectedNode,
          customNode: _customNode
        };

        clearQueries(prevSettings, newSettings);
        setLocalStorageItem("settings", JSON.stringify(newSettings));

        return newSettings;
      });
    },
    [isCustomNode, isRefreshingNodeStatus, customNode, setLocalStorageItem, apiEndpoint, nodes, setSettings]
  );

  return (
    <SettingsProviderContext.Provider
      value={{ settings, setSettings: updateSettings, isLoadingSettings, refreshNodeStatuses, isRefreshingNodeStatus, selectedNetworkId, setSelectedNetworkId }}
    >
      {children}
    </SettingsProviderContext.Provider>
  );
};

export const useSettings = () => {
  return { ...React.useContext(SettingsProviderContext) };
};
