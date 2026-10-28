import { describe, expect, it } from "vitest";
import {
  isBlockedHostname,
  isBlockedIp,
  isPrivateIpv4,
  isPrivateIpv6,
} from "@/server/services/crawler/ip-rules";

describe("isPrivateIpv4", () => {
  it("blocks loopback, private, link-local, CGNAT and reserved ranges", () => {
    const blocked = [
      "127.0.0.1", // loopback
      "127.1.2.3",
      "0.0.0.0", // this network
      "10.0.0.1", // RFC1918
      "10.255.255.255",
      "172.16.0.1", // RFC1918
      "172.31.255.254",
      "192.168.1.1", // RFC1918
      "169.254.169.254", // cloud metadata (link-local)
      "169.254.0.1",
      "100.64.0.1", // CGNAT
      "100.100.100.200", // Alibaba metadata
      "100.127.255.255",
      "192.0.0.1",
      "192.0.2.5", // TEST-NET-1
      "198.18.0.1", // benchmarking
      "198.51.100.7", // TEST-NET-2
      "203.0.113.9", // TEST-NET-3
      "224.0.0.1", // multicast
      "239.255.255.250",
      "240.0.0.1", // reserved
      "255.255.255.255", // broadcast
    ];
    for (const ip of blocked) {
      expect(isPrivateIpv4(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    const publicIps = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "172.15.255.255", "100.128.0.1", "101.0.0.1"];
    for (const ip of publicIps) {
      expect(isPrivateIpv4(ip), ip).toBe(false);
    }
  });
});

describe("isPrivateIpv6", () => {
  it("blocks loopback, unique-local, link-local, multicast and mapped private", () => {
    const blocked = [
      "::1",
      "::",
      "fd00::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback
      "::ffff:192.168.0.1", // IPv4-mapped private
      "::ffff:7f00:1", // hex-mapped 127.0.0.1
      "[::1]",
      "fe80::1%eth0",
    ];
    for (const ip of blocked) {
      expect(isPrivateIpv6(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
      expect(isPrivateIpv6(ip), ip).toBe(false);
    }
  });
});

describe("isBlockedIp (safe default)", () => {
  it("blocks anything that is not a confirmably public IP literal", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
    expect(isBlockedIp("999.1.1.1")).toBe(true);
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("[2606:4700::1111]")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("refuses localhost-style names, tolerates normal hosts", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("LOCALHOST.")).toBe(true);
    expect(isBlockedHostname("app.localhost")).toBe(true);
    expect(isBlockedHostname("")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("localhost.attacker.example")).toBe(false); // public host, judged by DNS
  });
});
