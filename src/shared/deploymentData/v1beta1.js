import { CustomValidationError, ManifestVersion, ParseServiceProtocol, getCurrentHeight, shouldBeIngress, parseSizeStr } from "./helpers";
import { defaultInitialDeposit } from "../constants";

const defaultHTTPOptions = {
  MaxBodySize: 2097152,
  ReadTimeout: 60000,
  SendTimeout: 60000,
  NextTries: 3,
  NextTimeout: 0,
  NextCases: ["off"]
};

// https://github.com/ovrclk/akash/blob/58fe860b1b9a0f08b36b2d727efff0373b03a5bd/x/deployment/types/v1beta1/validation_config.go
// const validationConfig = {
//   maxUnitCPU: 10 * 1000, // 10 CPUs
//   maxUnitMemory: 16 * specSuffixes.Gi, // 16 Gi
//   maxUnitStorage: specSuffixes.Ti, // 1 Ti
//   maxUnitCount: 50,
//   maxUnitPrice: 10000000, // 10akt

//   minUnitCPU: 10,
//   minUnitMemory: specSuffixes.Mi,
//   minUnitStorage: 5 * specSuffixes.Mi,
//   minUnitCount: 1,
//   minUnitPrice: 1,

//   maxGroupCount: 20,
//   maxGroupUnits: 20,

//   maxGroupCPU: 20 * 1000,
//   maxGroupMemory: 32 * specSuffixes.Gi,
//   maxGroupStorage: specSuffixes.Ti
// };

function getHttpOptions(options = {}) {
  return {
    MaxBodySize: options["max_body_size"] || defaultHTTPOptions.MaxBodySize,
    ReadTimeout: options["read_timeout"] || defaultHTTPOptions.ReadTimeout,
    SendTimeout: options["send_timeout"] || defaultHTTPOptions.SendTimeout,
    NextTries: options["next_tries"] || defaultHTTPOptions.NextTries,
    NextTimeout: options["next_timeout"] || defaultHTTPOptions.NextTimeout,
    NextCases: options["next_cases"] || defaultHTTPOptions.NextCases
  };
}

// Port of: func (sdl *v2ComputeResources) toResourceUnits() types.ResourceUnits
export function toResourceUnits(computeResources) {
  if (!computeResources) return {};

  let units = {};
  if (computeResources.cpu) {
    const cpu =
      typeof computeResources.cpu.units === "string" && computeResources.cpu.units.endsWith("m")
        ? computeResources.cpu.units.slice(0, -1)
        : (computeResources.cpu.units * 1000).toString();

    units.cpu = {
      units: { val: cpu }
      //attributes: computeResources.cpu.attributes TODO
    };
  }
  if (computeResources.memory) {
    units.memory = {
      quantity: { val: parseSizeStr(computeResources.memory.size) }
      //attributes: computeResources.memory.attributes TODO
    };
  }
  if (computeResources.storage) {
    units.storage = {
      quantity: { val: parseSizeStr(computeResources.storage.size) }
      //attributes: computeResources.storage.attributes TODO
    };
  }

  units.endpoints = null;

  return units;
}

function DeploymentGroups(yamlJson) {
  let groups = {};

  Object.keys(yamlJson.services).forEach((svcName) => {
    const svc = yamlJson.services[svcName];
    const depl = yamlJson.deployment[svcName];

    if (!depl) {
      throw new CustomValidationError(`Service "${svcName}" is not defined in the "deployment" section.`);
    }

    Object.keys(depl).forEach((placementName) => {
      const svcdepl = depl[placementName];
      const compute = yamlJson.profiles.compute[svcdepl.profile];
      const infra = yamlJson.profiles.placement[placementName];

      if (!infra) {
        throw new CustomValidationError(`The placement "${placementName}" is not defined in the "placement" section.`);
      }

      const price = infra.pricing[svcdepl.profile];

      if (!price) {
        throw new CustomValidationError(`The pricing for the "${svcdepl.profile}" profile is not defined in the "${placementName}" placement definition.`);
      }

      if (!compute) {
        throw new CustomValidationError(`The compute requirements for the "${svcdepl.profile}" profile are not defined in the "compute" section.`);
      }

      price.amount = price.amount.toString(); // Interpreted as number otherwise

      let group = groups[placementName];

      if (!group) {
        group = {
          name: placementName,
          requirements: {
            attributes: infra.attributes && Object.keys(infra.attributes).map((key) => ({ key: key, value: infra.attributes[key] })),
            signed_by: {
              all_of: infra.signedBy?.allOf,
              any_of: infra.signedBy?.anyOf
            }
          },
          resources: []
        };

        if (group.requirements.attributes) {
          group.requirements.attributes = group.requirements.attributes.sort((a, b) => a.key < b.key);
        }

        groups[group.name] = group;
      }

      const resources = {
        resources: toResourceUnits(compute.resources), // Chanded resources => unit
        price: price,
        count: svcdepl.count
      };

      let endpoints = [];
      svc?.expose?.forEach((expose) => {
        expose?.to?.forEach((to) => {
          if (to.global) {
            const proto = ParseServiceProtocol(expose.proto);

            const v = {
              port: expose.port,
              externalPort: expose.as || 0,
              proto: proto,
              service: to.service || null,
              global: !!to.global,
              hosts: expose.accept || null,
              HTTPOptions: getHttpOptions(expose["http_options"])
            };

            // TODO Enum
            const Endpoint_SHARED_HTTP = 0;
            const Endpoint_RANDOM_PORT = 1;

            let kind = Endpoint_RANDOM_PORT;

            if (shouldBeIngress(v)) {
              kind = Endpoint_SHARED_HTTP;
            }

            endpoints.push({ kind: kind });
          }
        });
      });

      resources.resources.endpoints = endpoints;
      group.resources.push(resources);
    });
  });

  let names = Object.keys(groups);
  names = names.sort((a, b) => a < b);

  let result = names.map((name) => groups[name]);
  return result;
}

function DepositFromFlags(deposit) {
  return {
    denom: "uakt",
    amount: deposit.toString()
  };
}

// Port of:    func (sdl *v2) Manifest() (manifest.Manifest, error
export function Manifest(yamlJson) {
  let groups = {};

  Object.keys(yamlJson.services).forEach((svcName) => {
    const svc = yamlJson.services[svcName];
    const depl = yamlJson.deployment[svcName];

    Object.keys(depl).forEach((placementName) => {
      const svcdepl = depl[placementName];
      let group = groups[placementName];

      if (!group) {
        group = {
          Name: placementName,
          Services: []
        };
        groups[placementName] = group;
      }

      const compute = yamlJson.profiles.compute[svcdepl.profile];

      const msvc = {
        Name: svcName,
        Image: svc.image,
        Command: null,
        Args: svc.args || null,
        Env: svc.env || null,
        Resources: toResourceUnits(compute.resources),
        Count: svcdepl.count,
        Expose: []
      };

      svc.expose?.forEach((expose) => {
        const proto = ParseServiceProtocol(expose.proto);

        if (expose.to && expose.to.length > 0) {
          expose.to.forEach((to) => {
            msvc.Expose.push({
              Port: expose.port,
              ExternalPort: expose.as || 0,
              Proto: proto,
              Service: to.service || "",
              Global: !!to.global,
              Hosts: expose.accept || null,
              HTTPOptions: getHttpOptions(expose["http_options"])
            });
          });
        } else {
          msvc.Expose.push({
            Port: expose.port,
            ExternalPort: expose.as || 0,
            Proto: proto,
            Service: "",
            Global: false,
            Hosts: expose.accept?.items || null,
            HTTPOptions: getHttpOptions(expose["http_options"])
          });
        }
      });

      msvc.Expose = msvc.Expose.sort((a, b) => {
        if (a.Service !== b.Service) {
          return a.Service < b.Service;
        }
        if (a.Port !== b.Port) {
          return a.Port < b.Port;
        }
        if (a.Proto !== b.Proto) {
          return a.Proto < b.Proto;
        }
        if (a.Global !== b.Global) {
          return a.Global < b.Global;
        }
        return false;
      });

      group.Services.push(msvc);
    });
  });

  let names = Object.keys(groups);
  names = names.sort((a, b) => a < b);

  let result = names.map((name) => groups[name]);
  return result;
}

export async function NewDeploymentData(apiEndpoint, yamlJson, dseq, fromAddress, deposit = defaultInitialDeposit) {
  const groups = DeploymentGroups(yamlJson);
  const mani = Manifest(yamlJson);
  const ver = await ManifestVersion(mani);
  const id = {
    owner: fromAddress,
    dseq: dseq
  };
  const _deposit = DepositFromFlags(deposit);

  if (!id.dseq) {
    id.dseq = await getCurrentHeight(apiEndpoint);
  }

  return {
    sdl: yamlJson,
    manifest: mani,
    groups: groups,
    deploymentId: id,
    orderId: [],
    leaseId: [],
    version: ver,
    deposit: _deposit
  };
}
