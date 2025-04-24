# @elysiumjs/styx

CLI tool for Elysium.

## Usage

To create new items:

```bash
bun styx make:controller
bun styx make:job
bun styx make:middleware
bun styx make:service
bun styx make:command
```

To run the Elysium server:

```bash
bun styx serve
```

To execute a command:

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

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for more information.
