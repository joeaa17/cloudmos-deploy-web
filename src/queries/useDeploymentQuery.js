import { useQuery } from "react-query";
import { QueryKeys } from "./queryKeys";
import axios from "axios";
import { ApiUrlService, loadWithPagination } from "../shared/utils/apiUtils";
import { deploymentToDto } from "../shared/utils/deploymentDetailUtils";
import { useSettings } from "../context/SettingsProvider";

// Deployment list
async function getDeploymentList(apiEndpoint, address) {
  if (!address) return [];

  const deployments = await loadWithPagination(ApiUrlService.deploymentList(apiEndpoint, address), "deployments", 1000);

  return deployments.map((d) => deploymentToDto(d));
}

export function useDeploymentList(address, options) {
  const { settings } = useSettings();
  return useQuery(QueryKeys.getDeploymentListKey(address), () => getDeploymentList(settings.apiEndpoint, address), options);
}

// Deployment detail
async function getDeploymentDetail(apiEndpoint, address, dseq) {
  if (!address) return {};

  const response = await axios.get(process.env.REACT_APP_proxy+ApiUrlService.deploymentDetail(apiEndpoint, address, dseq));

  return deploymentToDto(response.data);
}

export function useDeploymentDetail(address, dseq, options) {
  const { settings } = useSettings();
  return useQuery(QueryKeys.getDeploymentDetailKey(address, dseq), () => getDeploymentDetail(settings.apiEndpoint, address, dseq), options);
}
