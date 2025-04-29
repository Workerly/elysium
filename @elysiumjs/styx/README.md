# @elysiumjs/styx

CLI tool for Elysium.

## Installation

```bash
bun install @elysiumjs/styx
```

## Usage

The `styx` command needs to be run from the root of your Elysium project.

To create new items:

```bash
bun styx exec make:controller [options]
bun styx exec make:job [options]
bun styx exec make:middleware [options]
bun styx exec make:service [options]
bun styx exec make:command [options]
```

To start the Elysium project:

```bash
bun styx serve
```

To execute a custom command:

```bash
bun styx exec <command>
```

To run a worker:

```bash
bun styx work --queue queue1 --queue queue2
```

To show all available commands:

```bash
bun styx list
```

To get help for a specific command:

```bash
bun styx help <command>
```

## Contributing

This project is built primarily to meet requirements for internal projects at [Workbud Technologies Inc.](https://www.workbud.com)

Feel free to open issues for any bugs or questions you may have. Pull requests are also welcome, but they will be reviewed to ensure they align with our internal project's goals and standards.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](../../LICENSE) file for more information.
