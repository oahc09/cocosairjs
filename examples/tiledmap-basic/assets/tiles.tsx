<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.4" tiledversion="1.4" name="tiles" tilewidth="32" tileheight="32" tilecount="2" columns="2" margin="0" spacing="0">
  <image source="tiles.png" width="64" height="32"/>
  <tile id="0">
    <properties>
      <property name="kind" value="grass"/>
      <property name="solid" type="bool" value="false"/>
    </properties>
    <animation>
      <frame tileid="0" duration="500"/>
      <frame tileid="1" duration="500"/>
    </animation>
  </tile>
  <tile id="1">
    <properties>
      <property name="kind" value="stone"/>
      <property name="solid" type="bool" value="true"/>
      <property name="slip" type="float" value="0.25"/>
    </properties>
  </tile>
</tileset>
