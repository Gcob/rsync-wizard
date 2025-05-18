import RemoteHost from "./src/models/RemoteHost.js";

const host1 = new RemoteHost("ubuntu", "15.222.225.36")

host1.name = "My Host 1"
host1.save()

/** @type {RemoteHost} */
const host2 = RemoteHost.find('My Host 1')

if (host2) {
    host2.host = "ssh.2t-inc.com"
    host2.save()
}

const host3 = RemoteHost.find('My Host 1')

// host3.delete()

console.log("ok")