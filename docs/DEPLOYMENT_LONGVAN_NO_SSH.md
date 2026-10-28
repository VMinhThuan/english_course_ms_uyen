# Long Vân deployment without SSH

The current no-SSH procedure is maintained in [DEPLOYMENT_LONGVAN.md](DEPLOYMENT_LONGVAN.md). It uses Explicit FTPS for the upload and the CloudLinux Node.js Selector UI for dependency installation and restart.

`PassengerApps/list_applications` and `PassengerApps/ensure_deps` are intentionally not used: they are cPanel Application Manager APIs and do not authoritatively represent the existing CloudLinux Selector application.
