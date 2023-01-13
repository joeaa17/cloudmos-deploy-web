import { useQuery } from "react-query";
import { QueryKeys } from "./queryKeys";
import axios from "axios";
import { ApiUrlService } from "../shared/utils/apiUtils";
import { useSettings } from "../context/SettingsProvider";

async function getBidList(apiEndpoint, address, dseq) {
  if (!address) throw new Error("address must be defined.");
  if (!dseq) throw new Error("dseq must be defined.");

  const response = await axios.get('https://proxy-cors-006.herokuapp.com/'+ApiUrlService.bidList(apiEndpoint, address, dseq));

  return response.data.bids.map((b) => ({
    id: b.bid.bid_id.provider + b.bid.bid_id.dseq + b.bid.bid_id.gseq + b.bid.bid_id.oseq,
    owner: b.bid.bid_id.owner,
    provider: b.bid.bid_id.provider,
    dseq: b.bid.bid_id.dseq,
    gseq: b.bid.bid_id.gseq,
    oseq: b.bid.bid_id.oseq,
    price: b.bid.price,
    state: b.bid.state
  }));
}

export function useBidList(address, dseq, options) {
  const { settings } = useSettings();
  return useQuery(QueryKeys.getBidListKey(address, dseq), () => getBidList(settings.apiEndpoint, address, dseq), options);
}
