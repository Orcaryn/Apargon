import net from 'net';
import type { Permissions } from './tags.ts';

export const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export function localPorts({ net }: Permissions) {
  return net
    .map(pattern => pattern.split(':'))
    .filter(([host]) => LOCAL_HOSTS.includes(host))
    .map(([, port]) => port);
}

export function privateNetwork() {
  const addresses = new net.BlockList();
  addresses.addSubnet('127.0.0.0', 8, 'ipv4');
  addresses.addSubnet('0.0.0.0', 8, 'ipv4');
  addresses.addSubnet('10.0.0.0', 8, 'ipv4');
  addresses.addSubnet('172.16.0.0', 12, 'ipv4');
  addresses.addSubnet('192.168.0.0', 16, 'ipv4');
  addresses.addSubnet('100.64.0.0', 10, 'ipv4');
  addresses.addSubnet('169.254.0.0', 16, 'ipv4');
  addresses.addAddress('::', 'ipv6');
  addresses.addAddress('::1', 'ipv6');
  addresses.addSubnet('fc00::', 7, 'ipv6');
  addresses.addSubnet('fe80::', 10, 'ipv6');
  addresses.addSubnet('64:ff9b::', 96, 'ipv6');

  return addresses;
}
