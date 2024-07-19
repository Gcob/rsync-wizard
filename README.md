# Build Rsync command

Add this in your .bashrc or .bash_aliases file

```bash
rsyncb() {
    node ~/tools/rsyncb/build-rsync.mjs $1 $2
}
```

Install the dependencies

```bash
npm i
```

### Commands : 

* `rsyncb` : Starts the wizard to build the rsync command.
* `rsyncb help` : Shows the help.
* `rsyncb last` : Shows the last rsync command built.
* `rsyncb history [filter]` : Shows the history of rsync commands built. The filter is optional.