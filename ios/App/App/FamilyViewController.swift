import Capacitor

class FamilyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SleepLiveActivityPlugin())
    }
}
