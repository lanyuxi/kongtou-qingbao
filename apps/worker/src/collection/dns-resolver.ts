import { lookup as nodeLookup } from 'node:dns';

import {
  validateResolvedAddresses,
  type ResolvedAddress,
} from '@airdrop/domain';

import type { SafeDnsResolver } from './ports.js';

interface DnsLookupOptions {
  readonly all: true;
  readonly order: 'verbatim';
}

type DnsLookupCallback = (
  error: NodeJS.ErrnoException | null,
  addresses: ResolvedAddress[],
) => void;

export type DnsLookup = (
  hostname: string,
  options: DnsLookupOptions,
  callback: DnsLookupCallback,
) => void;

const productionLookup: DnsLookup = (hostname, options, callback) => {
  nodeLookup(hostname, options, (error, addresses) => {
    if (error !== null) {
      callback(error, []);
      return;
    }
    // Node types expose `family` as number even though lookup's documented
    // results are 4 or 6. Preserve each raw pair so Task 2 rejects any mismatch.
    callback(null, addresses as ResolvedAddress[]);
  });
};

export function createSafeDnsResolver(lookup: DnsLookup = productionLookup): SafeDnsResolver {
  return {
    resolve(hostname) {
      return new Promise((resolve, reject) => {
        lookup(hostname, { all: true, order: 'verbatim' }, (error, addresses) => {
          if (error !== null) {
            reject(error);
            return;
          }

          try {
            resolve(validateResolvedAddresses(addresses));
          } catch (validationError) {
            reject(validationError);
          }
        });
      });
    },
  };
}
