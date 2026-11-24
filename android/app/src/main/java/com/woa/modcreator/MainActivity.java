package com.woa.modcreator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WoaStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
